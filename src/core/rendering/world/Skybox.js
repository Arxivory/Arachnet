import * as THREE from 'three';

export function initSkybox() {
    const skyGeo = new THREE.SphereGeometry(1000, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            colorTop: { value: new THREE.Color(0x0077ff) }, 
            colorBottom: { value: new THREE.Color(0xffffff) }, 
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
            vWorldPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 colorTop;
            uniform vec3 colorBottom;
            varying vec3 vWorldPosition;
            void main() {
            float h = normalize(vWorldPosition).y;
            gl_FragColor = vec4(mix(colorBottom, colorTop, max(h, 0.0)), 1.0);
            }
        `,
        side: THREE.BackSide 
    });

    const skybox = new THREE.Mesh(skyGeo, skyMat);

    return skybox;
}