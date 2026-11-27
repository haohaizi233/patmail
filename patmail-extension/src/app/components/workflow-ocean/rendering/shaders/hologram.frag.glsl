uniform float uTime;
uniform vec3 uCoreColor;
uniform vec3 uRimColor;
uniform float uOpacity;

varying vec3 vNormalDir;
varying vec3 vViewDir;
varying vec2 vLocalUv;

void main() {
  float fresnel = pow(1.0 - max(dot(normalize(vViewDir), normalize(vNormalDir)), 0.0), 2.4);
  float scan = sin(vLocalUv.y * 28.0 - uTime * 1.4) * 0.5 + 0.5;
  vec3 color = mix(uCoreColor, uRimColor, clamp(fresnel * 0.92 + scan * 0.14, 0.0, 1.0));
  float alpha = clamp(uOpacity * (0.42 + fresnel * 0.72), 0.12, 0.94);
  gl_FragColor = vec4(color, alpha);
}
