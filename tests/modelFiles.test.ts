import { describe, expect, it } from 'vitest';
import { classifyModelFiles, fileBase, fileStem, findFile, gltfExternalFiles, modelFormat, mtlTextureFiles, objMaterialLibs } from '../src/core/modelFiles';

describe('pliki modeli', () => {
  it('rozpoznaje formaty i nazwy bez katalogów', () => {
    expect(modelFormat('modele/Drzewo.FBX')).toBe('fbx');
    expect(modelFormat('a.gltf')).toBe('gltf');
    expect(modelFormat('a.png')).toBeNull();
    expect(fileBase('C:\\tekstury\\kora%20dębu.png')).toBe('kora dębu.png');
    expect(fileStem('modele/kladka.glb')).toBe('kladka');
    expect(fileStem('kladka.fbx')).toBe(fileStem('inne/kladka.glb'));
  });

  it('dzieli pliki na modele, towarzyszące i nieznane', () => {
    const r = classifyModelFiles(['dom.obj', 'dom.mtl', 'cegla.jpg', 'scena.gltf', 'scena.bin', 'opis.txt']);
    expect(r.models).toEqual(['dom.obj', 'scena.gltf']);
    expect(r.companions).toEqual(['dom.mtl', 'cegla.jpg', 'scena.bin']);
    expect(r.unknown).toEqual(['opis.txt']);
  });

  it('czyta odwołania .gltf, .obj i .mtl', () => {
    expect(gltfExternalFiles({ buffers: [{ uri: 'scena.bin' }, { uri: 'data:application/octet-stream;base64,AA==' }], images: [{ uri: 'tex/a.png' }] })).toEqual(['scena.bin', 'tex/a.png']);
    expect(objMaterialLibs('# x\nmtllib dom.mtl\nv 0 0 0\n')).toEqual(['dom.mtl']);
    expect(mtlTextureFiles('newmtl a\nmap_Kd -s 1 1 1 tekstury/cegla.jpg\nbump cegla_n.png\nKd 1 1 1\n')).toEqual(['tekstury/cegla.jpg', 'cegla_n.png']);
  });

  it('znajduje plik bez względu na katalog i wielkość liter', () => {
    const m = new Map([['Cegla.JPG', 1]]);
    expect(findFile(m, 'tekstury/cegla.jpg')).toBe(1);
    expect(findFile(m, 'brak.png')).toBeUndefined();
  });
});
