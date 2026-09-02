import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/Addons.js';

let cachedEnvMap;

export async function loadEnvironmentMap(renderer) {
    if (cachedEnvMap) return cachedEnvMap;

    const loader = new RGBELoader();
    const envMap = await loader.loadAsync('textures/environmentMaps/autumn_hill_view_4k.hdr');

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    cachedEnvMap = pmrem.fromEquirectangular(envMap).texture;

    envMap.dispose();
    pmrem.dispose();

    return cachedEnvMap;
}