import * as THREE from 'three';

const textureCache = new Map();
const textureLoader = new THREE.TextureLoader();

export default function getCachedTexture(url) {
    if (!textureCache.has(url)) {
        const tex = textureLoader.load(url);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 16;
        textureCache.set(url, tex);
    }
    return textureCache.get(url).clone();
}