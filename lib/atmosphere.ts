import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { WorldRenderer } from "./renderer";
import type { GameSettings, WeatherMode, ShaderStyle } from "./settings";
import type { Dimension } from "./blocks";
export class Atmosphere {
  composer: EffectComposer;
  output = new OutputPass();
  grade: ShaderPass;
  rain: THREE.LineSegments;
  snow: THREE.Points;
  rainPos: Float32Array;
  snowPos: Float32Array;
  count = 700;
  weather: Exclude<WeatherMode, "auto"> = "clear";
  wet = 0;
  flash = 0;
  thunderTimer = 24;
  motes: THREE.Points;
  motePos = new Float32Array(160 * 3);
  stars: THREE.Points;
  sunDisc: THREE.Mesh;
  moonDisc: THREE.Mesh;
  animationTime = 0;
  disposed = false;
  lastShader = "";
  lastW = 0;
  lastH = 0;
  constructor(public view: WorldRenderer) {
    this.composer = new EffectComposer(view.renderer);
    this.composer.addPass(new RenderPass(view.scene, view.camera));
    this.composer.addPass(this.output);
    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        style: { value: 1 },
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(1200, 800) },
      },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `uniform sampler2D tDiffuse;uniform float style;uniform float time;uniform vec2 resolution;varying vec2 vUv;
 void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float luminance=dot(c,vec3(.299,.587,.114));
 if(style>0.5&&style<1.5){vec3 glow=vec3(0.);vec2 d=2.5/resolution;glow+=max(texture2D(tDiffuse,vUv+d).rgb-.67,0.);glow+=max(texture2D(tDiffuse,vUv-d).rgb-.67,0.);glow+=max(texture2D(tDiffuse,vUv+vec2(-d.x,d.y)).rgb-.67,0.);glow+=max(texture2D(tDiffuse,vUv+vec2(d.x,-d.y)).rgb-.67,0.);c+=glow*.09;c=mix(vec3(luminance),c,1.08);c*=vec3(1.025,1.01,.975);c=(c-.5)*1.035+.5;}
 if(style>1.5&&style<2.5){c=mix(vec3(luminance),c,1.35);c=(c-.5)*1.045+.52;}
 if(style>2.5&&style<3.5){vec2 uv=floor(vUv*resolution*.6)/(resolution*.6);c=texture2D(tDiffuse,uv).rgb;float d=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);c=floor(c*20.+d*.7)/20.;}
 if(style>3.5){c=mix(vec3(luminance),c,.85);c=pow(c,vec3(.91));c=mix(c,vec3(.86,.90,.84),.045);}
 if(style>0.5){float v=distance(vUv,vec2(.5));c*=1.-smoothstep(.35,.83,v)*.06;}gl_FragColor=vec4(clamp(c,0.,1.),1.);}`,
    });
    this.composer.addPass(this.grade);
    const moteGeo = new THREE.BufferGeometry();
    for (let i = 0; i < 160; i++)
      this.motePos.set(
        [(Math.random() - 0.5) * 34, Math.random() * 15, (Math.random() - 0.5) * 34],
        i * 3,
      );
    moteGeo.setAttribute("position", new THREE.BufferAttribute(this.motePos, 3));
    this.motes = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({
        color: "#ffc1d8",
        size: 0.15,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    this.motes.frustumCulled = false;
    const starPos = [];
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2,
        y = Math.random(),
        r = Math.sqrt(1 - y * y);
      starPos.push(Math.cos(a) * r * 250, y * 250, Math.sin(a) * r * 250);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: "#e4dcff",
        size: 0.65,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    );
    this.stars.frustumCulled = false;
    this.sunDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 11),
      new THREE.MeshBasicMaterial({
        color: "#fff3c1",
        depthWrite: false,
        fog: false,
      }),
    );
    this.moonDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshBasicMaterial({
        color: "#dbe7ef",
        depthWrite: false,
        fog: false,
      }),
    );
    view.scene.add(this.motes, this.stars, this.sunDisc, this.moonDisc);
    this.rainPos = new Float32Array(this.count * 6);
    this.snowPos = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      const x = (Math.random() - 0.5) * 65,
        y = Math.random() * 45,
        z = (Math.random() - 0.5) * 65;
      this.rainPos.set([x, y, z, x - 0.08, y + 1.2, z], i * 6);
      this.snowPos.set([x, y, z], i * 3);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(
      rg,
      new THREE.LineBasicMaterial({
        color: "#bed9df",
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        color: "#f0f5f7",
        size: 0.12,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    this.snow.frustumCulled = false;
    view.scene.add(this.rain, this.snow);
    this.rain.visible = false;
    this.snow.visible = false;
    view.renderScene = () => this.render();
  }
  configure(settings: GameSettings) {
    this.lastShader = settings.shader;
    const ids: Record<ShaderStyle, number> = {
      off: 0,
      classic: 0,
      cinematic: 1,
      vivid: 2,
      retro: 3,
      soft: 4,
    };
    this.grade.uniforms.style.value = ids[settings.shader] ?? 1;
    this.view.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.resolution));
    this.view.resize();
    const size = this.view.renderer.getSize(new THREE.Vector2());
    this.composer.setPixelRatio(this.view.renderer.getPixelRatio());
    this.composer.setSize(size.x, size.y);
    this.grade.uniforms.resolution.value.set(
      size.x * this.view.renderer.getPixelRatio(),
      size.y * this.view.renderer.getPixelRatio(),
    );
    this.lastW = size.x;
    this.lastH = size.y;
  }
  render() {
    if (this.disposed) return;
    if (this.lastShader === "off") {
      this.view.renderer.render(this.view.scene, this.view.camera);
      return;
    }
    const size = this.view.renderer.getSize(new THREE.Vector2());
    if (this.lastW !== size.x || this.lastH !== size.y) {
      this.composer.setSize(size.x, size.y);
      this.grade.uniforms.resolution.value.copy(size);
      this.lastW = size.x;
      this.lastH = size.y;
    }
    this.composer.render();
  }
  tick(
    dt: number,
    time: number,
    settings: GameSettings,
    player: THREE.Vector3,
    dimension: Dimension,
    biome: string,
    thunder: () => void,
  ) {
    const v = this.view;
    this.animationTime += dt;
    const anim = this.animationTime;
    const night = time % 600 > 350 && time % 600 < 545,
      cherry = biome === "Wiśniowe wzgórza",
      fireflies = biome === "Lasy namorzynowe" || biome === "Bujne jaskinie",
      spores = biome === "Grzybowa dolina" || biome === "Kryształowa kotlina";
    this.motes.visible =
      settings.particles && dimension === "overworld" && (cherry || (fireflies && night) || spores);
    this.motes.position.set(player.x, player.y - 3, player.z);
    const moteMat = this.motes.material as THREE.PointsMaterial;
    moteMat.color.set(cherry ? "#ffb4d5" : fireflies ? "#e8ff78" : "#c4a5ff");
    moteMat.size = cherry ? 0.15 : 0.075;
    moteMat.opacity = fireflies ? 0.6 + Math.sin(anim * 2) * 0.3 : 0.75;
    if (this.motes.visible) {
      for (let i = 0; i < 160; i++) {
        const n = i * 3;
        this.motePos[n] += dt * (cherry ? 0.4 : Math.sin(anim + i) * 0.2);
        this.motePos[n + 1] += dt * (cherry ? -0.65 : Math.sin(anim * 0.6 + i) * 0.18);
        this.motePos[n + 2] += Math.cos(anim * 0.7 + i) * dt * 0.2;
        if (this.motePos[n + 1] < 0) this.motePos[n + 1] = 15;
        if (this.motePos[n] > 17) this.motePos[n] = -17;
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
    }
    this.stars.visible = dimension !== "nether";
    this.stars.position.copy(player);
    (this.stars.material as THREE.PointsMaterial).opacity =
      dimension === "end" ? 0.5 : night ? 0.7 : 0;
    this.sunDisc.visible = dimension === "overworld";
    this.moonDisc.visible = dimension === "overworld";
    const orbit = ((time % 600) / 600) * Math.PI * 2;
    this.sunDisc.position
      .copy(player)
      .add(new THREE.Vector3(Math.cos(orbit) * 170, Math.sin(orbit) * 170, -100));
    this.moonDisc.position
      .copy(player)
      .add(new THREE.Vector3(-Math.cos(orbit) * 170, -Math.sin(orbit) * 170, 100));
    this.sunDisc.lookAt(player);
    this.moonDisc.lookAt(player);
    let weather = settings.weather;
    if (weather === "auto") {
      const n = Math.floor(time / 180) % 6;
      weather = n === 1 || n === 4 ? "rain" : n === 2 ? "storm" : "clear";
      if (biome === "Śnieżne szczyty" && weather !== "clear") weather = "snow";
    }
    if (dimension !== "overworld") weather = "clear";
    this.weather = weather;
    const target = weather === "clear" ? 0 : weather === "storm" ? 1 : 0.6;
    this.wet += (target - this.wet) * Math.min(1, dt * 0.35);
    this.rain.visible = this.wet > 0.01 && weather !== "snow" && dimension === "overworld";
    this.snow.visible = weather === "snow";
    this.rain.geometry.setDrawRange(0, Math.floor(this.count * settings.weatherDensity) * 2);
    this.snow.geometry.setDrawRange(0, Math.floor(this.count * settings.weatherDensity));
    this.rain.position.set(player.x, player.y - 7, player.z);
    this.snow.position.copy(this.rain.position);
    (this.rain.material as THREE.LineBasicMaterial).opacity = this.wet * 0.5;
    const arr = weather === "snow" ? this.snowPos : this.rainPos,
      stride = weather === "snow" ? 3 : 6,
      speed = weather === "snow" ? 2.1 : weather === "storm" ? 33 : 24;
    for (let i = 0; i < this.count; i++) {
      const o = i * stride;
      arr[o] +=
        dt * (weather === "snow" ? Math.sin(time + i) * 0.7 : weather === "storm" ? 4 : 1.2);
      arr[o + 1] -= dt * speed;
      if (arr[o + 1] < 0 || Math.abs(arr[o]) > 34) {
        arr[o] = (Math.random() - 0.5) * 65;
        arr[o + 1] = 35 + Math.random() * 8;
        arr[o + 2] = (Math.random() - 0.5) * 65;
      }
      if (stride === 6) {
        arr[o + 3] = arr[o] - 0.08;
        arr[o + 4] = arr[o + 1] + 1.2;
        arr[o + 5] = arr[o + 2];
      }
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.snow.geometry.attributes.position.needsUpdate = true;
    if (dimension === "overworld") {
      const phase = (time % 600) / 600,
        daylight =
          phase < 0.5
            ? 1
            : phase < 0.65
              ? 1 - (phase - 0.5) / 0.15
              : phase < 0.9
                ? 0.08
                : 0.08 + ((phase - 0.9) / 0.1) * 0.92;
      v.sun.intensity = 0.15 + daylight * 2.35;
      v.ambient.intensity = 0.85 + daylight * 1.85;
      const daySky = v.sky.material as THREE.ShaderMaterial;
      daySky.uniforms.top.value.set("#18283f").lerp(new THREE.Color("#65a9ca"), daylight);
      daySky.uniforms.bottom.value.set("#33404c").lerp(new THREE.Color("#dbeddf"), daylight);
      (v.scene.fog as THREE.Fog).color.copy(daySky.uniforms.bottom.value);
      const fog = v.scene.fog as THREE.Fog;
      fog.color.lerp(new THREE.Color("#6e8790"), this.wet * 0.65);
      fog.near = (52 - this.wet * 23) * settings.fog;
      fog.far = (settings.view * 25 + 15 - this.wet * 24) * settings.fog;
      const sky = v.sky.material as THREE.ShaderMaterial;
      sky.uniforms.top.value.lerp(new THREE.Color("#667988"), this.wet * 0.8);
      sky.uniforms.bottom.value.lerp(new THREE.Color("#8d9b9d"), this.wet * 0.7);
      v.sun.intensity *= 1 - this.wet * 0.65;
      v.ambient.intensity *= 1 - this.wet * 0.25;
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    if (weather === "storm") {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) {
        this.thunderTimer = 18 + Math.random() * 24;
        this.flash = 0.45;
        thunder();
      }
    }
    if (this.flash > 0) v.ambient.intensity += this.flash * 2;
    this.grade.uniforms.time.value = time;
  }
  dispose() {
    this.disposed = true;
    this.view.scene.remove(
      this.rain,
      this.snow,
      this.motes,
      this.stars,
      this.sunDisc,
      this.moonDisc,
    );
    for (const o of [this.motes, this.stars, this.sunDisc, this.moonDisc]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.snow.geometry.dispose();
    (this.snow.material as THREE.Material).dispose();
    this.composer.dispose();
    this.output.dispose();
    this.grade.dispose();
  }
}
