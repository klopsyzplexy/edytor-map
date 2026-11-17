import { describe, expect, it } from 'vitest';
import raw from '../examples/schemat-przyklad.json';
import { DECORATION } from '../src/core/builtinTypes';
import { EditorDoc } from '../src/core/doc';
import { createMap } from '../src/core/map';
import { changeableTypes, changeObjectType, objectModel } from '../src/core/objectModel';
import { getType, parseSchema } from '../src/core/schema';
import { setPlayerModel, setTypeModel } from '../src/core/schemaEdit';
import { exampleSchema } from './helpers';

describe('zmiany schematu z interfejsu', () => {
  it('model typu z ułożeniem; wartości domyślne nie trafiają do pliku', () => {
    const r1 = setTypeModel(raw, 'generator', 'modele/boss.glb', { scale: [2, 2, 2], rotation: [0, 90, 0], offset: [0, 0, 0] }) as typeof raw;
    const look = r1.objectTypes.find((t) => t.id === 'generator')!.look as Record<string, unknown>;
    expect(look).toEqual({ shape: 'box', color: '#e0623a', model: 'modele/boss.glb', modelScale: 2, modelRotation: [0, 90, 0] });
    expect(getType(parseSchema(r1), 'generator')!.look.modelTransform).toEqual({ scale: [2, 2, 2], rotation: [0, 90, 0], offset: [0, 0, 0] });
    // oryginał bez zmian, a pozostałe pola zostają
    expect(raw.objectTypes.find((t) => t.id === 'generator')!.look).toEqual({ shape: 'box', color: '#e0623a' });
    const r2 = setTypeModel(r1, 'generator', undefined) as typeof raw;
    expect(r2.objectTypes.find((t) => t.id === 'generator')!.look).toEqual({ shape: 'box', color: '#e0623a' });
    expect(() => setTypeModel(raw, 'nie-ma', 'x.glb')).toThrow();
  });

  it('model postaci gracza', () => {
    const r = setPlayerModel(raw, 'modele/rycerz.glb', { scale: [0.01, 0.01, 0.01], rotation: [0, 180, 0], offset: [0, 0, 0] });
    const s = parseSchema(r);
    expect(s.player.model).toBe('modele/rycerz.glb');
    expect(s.player.modelTransform.scale).toEqual([0.01, 0.01, 0.01]);
    expect(s.player.radius).toBe(0.4);
    expect(parseSchema(setPlayerModel(r, undefined)).player.model).toBeUndefined();
  });

  it('zmiana schematu przechodzi przez cofnij/ponów', () => {
    const s = exampleSchema();
    const doc = new EditorDoc(s, createMap(s, { name: 'm', size: [8, 8], resolution: 9, height: 0 }), structuredClone(raw));
    doc.editSchema('model', (r) => setTypeModel(r, 'drzewo', 'modele/dab.glb'));
    expect(getType(doc.schema, 'drzewo')!.look.model).toBe('modele/dab.glb');
    doc.undo();
    expect(getType(doc.schema, 'drzewo')!.look.model).toBeUndefined();
    doc.redo();
    expect(getType(doc.schema, 'drzewo')!.look.model).toBe('modele/dab.glb');
    // błędny schemat nie zostaje przyjęty
    expect(() => doc.editSchema('zly', (r) => ({ ...(r as object), objectTypes: 5 }))).toThrow();
    expect(getType(doc.schema, 'drzewo')!.look.model).toBe('modele/dab.glb');
  });
});

describe('zmień typ', () => {
  it('dekoracja → typ ze schematu i z powrotem: model, pozycja, obrót i skala zostają', () => {
    const s = exampleSchema();
    const map = createMap(s, { name: 'm', size: [32, 32], resolution: 33, height: 0 });
    const doc = new EditorDoc(s, map);
    const d = doc.addObject(DECORATION, [4, 1, 5]);
    doc.updateObjects([d.id], (o) => {
      o.model = 'modele/boss.glb';
      o.rotation = [0, 30, 0];
      o.scale = [2, 2, 2];
      o.props.collision = true;
    });
    doc.updateObjects([d.id], (o) => changeObjectType(s, o, 'generator'));
    const g = doc.getObject(d.id)!;
    expect(g).toMatchObject({ type: 'generator', model: 'modele/boss.glb', position: [4, 1, 5], rotation: [0, 30, 0], scale: [2, 2, 2] });
    expect(g.props).toEqual({ nazwa: '', liczba: 3, rodzaj: 'zwykly', aktywny: true, kolor: '#ffcc00', obszar: null });
    doc.updateObjects([d.id], (o) => changeObjectType(s, o, DECORATION));
    expect(doc.getObject(d.id)).toMatchObject({ type: DECORATION, model: 'modele/boss.glb', props: { collision: false, walkable: false } });
    doc.undo();
    expect(doc.getObject(d.id)!.type).toBe('generator');
  });

  it('obiekt z modelem typu → dekoracja dostaje ten model (ze skalą typu); typ z tym samym modelem – bez własnego', () => {
    const r = setTypeModel(raw, 'drzewo', 'modele/dab.glb', { scale: [3, 3, 3], rotation: [0, 0, 0], offset: [0, 0, 0] });
    const s = parseSchema(r);
    const map = createMap(s, { name: 'm', size: [32, 32], resolution: 33, height: 0 });
    const doc = new EditorDoc(s, map);
    const t = doc.addObject('drzewo', [1, 0, 1]);
    doc.updateObjects([t.id], (o) => changeObjectType(s, o, DECORATION));
    expect(doc.getObject(t.id)).toMatchObject({ model: 'modele/dab.glb', scale: [3, 3, 3] });
    const d = doc.addObject(DECORATION, [2, 0, 2]);
    doc.updateObjects([d.id], (o) => ((o.model = 'modele/dab.glb'), changeObjectType(s, o, 'drzewo')));
    expect(doc.getObject(d.id)!.model).toBeUndefined();
    expect(objectModel(s, doc.getObject(d.id)!)!.ref).toBe('modele/dab.glb');
  });

  it('ścieżek i stref nie można zmienić; lista typów to dekoracja i punkty/bryły', () => {
    const s = exampleSchema();
    const map = createMap(s, { name: 'm', size: [32, 32], resolution: 33, height: 0 });
    const doc = new EditorDoc(s, map);
    const z = doc.addObject('obszar', [0, 0, 0], [[1, 0, 1], [3, 0, 1], [3, 0, 3]]);
    expect(() => changeObjectType(s, doc.getObject(z.id)!, DECORATION)).toThrow();
    const ids = changeableTypes(s).map((t) => t.id);
    expect(ids[0]).toBe(DECORATION);
    expect(ids).toContain('generator');
    expect(ids).not.toContain('trasa');
  });
});

import { isProjectZip, packProject, unpackProject } from '../src/storage/project';

describe('projekt .zip', () => {
  it('pakuje i rozpakowuje mapę, schemat, bibliotekę i modele', () => {
    const glb = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]).buffer;
    const zip = packProject({ mapJson: '{"format":"edytor-map"}', schemaRaw: raw, library: { models: [{ file: 'beczka.glb', folder: 'Rekwizyty' }] }, models: [{ name: 'beczka.glb', data: glb }] });
    const buf = zip.slice().buffer;
    expect(isProjectZip(buf)).toBe(true);
    const p = unpackProject(buf);
    expect(p.mapJson).toBe('{"format":"edytor-map"}');
    expect(p.schemaRaw).toEqual(raw);
    expect(p.library).toEqual({ models: [{ file: 'beczka.glb', folder: 'Rekwizyty' }] });
    expect(p.models.map((m) => m.name)).toEqual(['beczka.glb']);
    expect([...new Uint8Array(p.models[0].data)]).toEqual([...new Uint8Array(glb)]);
    expect(isProjectZip(new Uint8Array([1, 2, 3]).buffer)).toBe(false);
  });
});
