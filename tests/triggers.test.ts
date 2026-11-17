import { describe, expect, it } from 'vitest';
import { EditorDoc } from '../src/core/doc';
import { createMap } from '../src/core/map';
import { buildTriggers, TriggerState, zonesAt } from '../src/core/triggers';
import { exampleSchema } from './helpers';

function setup() {
  const schema = exampleSchema();
  const doc = new EditorDoc(schema, createMap(schema, { name: 't', size: [64, 64], resolution: 17, height: 0 }));
  const a = doc.addObject('przejscie', [10, 0, 10]);
  const b = doc.addObject('przejscie', [50, 0, 50]);
  const start = doc.addObject('start', [30, 0, 30]);
  const zone = doc.addObject('obszar', [0, 0, 0], [[20, 0, 0], [40, 0, 0], [40, 0, 20], [20, 0, 20]]);
  doc.updateObjects([a.id], (o) => (o.props.cel = b.id));
  doc.updateObjects([b.id], (o) => (o.props.cel = a.id));
  doc.updateObjects([zone.id], (o) => (o.props.nazwa = 'Polana'));
  return { schema, doc, a, b, start, zone };
}

describe('przejścia i strefy z komunikatem', () => {
  it('wyzwalacze z zachowań typów', () => {
    const { schema, doc, a, zone } = setup();
    const tr = buildTriggers(schema, doc.map);
    expect(tr.map((t) => t.kind).sort()).toEqual(['message', 'teleport', 'teleport']);
    expect(tr.find((t) => t.objectId === zone.id)!.text).toBe('Polana');
    expect(tr.find((t) => t.objectId === a.id)!.shape.length).toBeGreaterThan(3);
  });

  it('wejście w przejście przenosi do celu; w celu nie odsyła od razu z powrotem', () => {
    const { schema, doc, b } = setup();
    const st = new TriggerState(buildTriggers(schema, doc.map), doc.map);
    expect(st.update(5, 5, 0.4)).toEqual([]);
    const ev = st.update(10, 10, 0.4);
    expect(ev.length).toBe(1);
    expect(ev[0].type).toBe('teleport');
    if (ev[0].type === 'teleport') expect(ev[0].to).toEqual(b.position);
    // po przeniesieniu: przejście docelowe zapamiętane, bez działania
    expect(st.update(50, 50, 0.4, true)).toEqual([]);
    expect(st.update(50.2, 50, 0.4)).toEqual([]);
    // wyjście i ponowne wejście – działa
    st.update(55, 55, 0.4);
    expect(st.update(50, 50, 0.4)[0].type).toBe('teleport');
  });

  it('dotknięcie brzegu przejścia wystarcza (obiekt może mieć kolizję)', () => {
    const { schema, doc } = setup();
    const st = new TriggerState(buildTriggers(schema, doc.map), doc.map);
    // obrys 1,4 × 1,4 – brzeg w x = 10,7; postać o promieniu 0,4 dotyka z x = 11,1
    expect(st.update(11.1, 10, 0.4)[0]?.type).toBe('teleport');
  });

  it('przejście bez celu – zdarzenie noTarget', () => {
    const { schema, doc, a } = setup();
    doc.updateObjects([a.id], (o) => (o.props.cel = null));
    const st = new TriggerState(buildTriggers(schema, doc.map), doc.map);
    expect(st.update(10, 10, 0.4).map((e) => e.type)).toEqual(['noTarget']);
  });

  it('strefa: komunikat przy wejściu i wyjściu; lista stref pod postacią', () => {
    const { schema, doc, zone } = setup();
    const st = new TriggerState(buildTriggers(schema, doc.map), doc.map);
    expect(st.update(30, 30, 0.4)).toEqual([]);
    const enter = st.update(30, 10, 0.4);
    expect(enter.map((e) => [e.type, e.trigger.text])).toEqual([['enter', 'Polana']]);
    expect(st.messages().map((t) => t.objectId)).toEqual([zone.id]);
    expect(zonesAt(schema, doc.map, 30, 10).map((o) => o.id)).toEqual([zone.id]);
    expect(st.update(30, 30, 0.4).map((e) => e.type)).toEqual(['leave']);
    expect(zonesAt(schema, doc.map, 30, 30)).toEqual([]);
  });

  it('przejście do strefy: cel to środek strefy, a wejście w strefę daje komunikat', () => {
    const { schema, doc, a, zone } = setup();
    doc.updateObjects([a.id], (o) => (o.props.cel = zone.id));
    // cel spoza refTypes nie przeszkadza logice trybu gry (walidacja zgłasza zły typ osobno)
    const st = new TriggerState(buildTriggers(schema, doc.map), doc.map);
    const ev = st.update(10, 10, 0.4);
    expect(ev[0].type).toBe('teleport');
    if (ev[0].type !== 'teleport') return;
    expect(ev[0].to).toEqual([30, 0, 10]);
    expect(st.update(30, 10, 0.4, true).map((e) => e.type)).toEqual(['enter']);
  });
});
