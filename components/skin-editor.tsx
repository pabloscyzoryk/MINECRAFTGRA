'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  Pencil,
  Eraser,
  PaintBucket,
  Pipette,
  Rotate3D,
  Undo2,
  Redo2,
  Download,
  Upload,
  Check,
  Minus,
  Square,
  RotateCcw,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  SkinModel,
  readSkin,
  defaultSkin,
  saveSkin,
  PART_NAMES,
  FACE_NAMES,
  faceRect,
  type SkinData,
  type Part,
  type Face,
} from '@/lib/skin-model';
import { SKIN_PRESETS, presetSkin } from '@/lib/skin-presets';
type Tool = 'brush' | 'erase' | 'fill' | 'pick' | 'line' | 'rect' | 'orbit';
type State = {
  part: Part;
  face: Face;
  layer: number;
  tool: Tool;
  color: string;
  size: number;
  mirror: boolean;
};
type History = { skin: ImageData; cape: ImageData };
const toolsList = [
  { id: 'brush', name: 'Ołówek', icon: Pencil },
  { id: 'erase', name: 'Gumka', icon: Eraser },
  { id: 'fill', name: 'Wypełnienie', icon: PaintBucket },
  { id: 'pick', name: 'Pipeta', icon: Pipette },
  { id: 'line', name: 'Linia', icon: Minus },
  { id: 'rect', name: 'Prostokąt', icon: Square },
  { id: 'orbit', name: 'Obracanie modelu', icon: Rotate3D },
] as const;
const palette = [
  '#f3dfbd',
  '#c79874',
  '#9b6b4f',
  '#67483b',
  '#342d30',
  '#192b30',
  '#375666',
  '#567c90',
  '#779697',
  '#d7e4e3',
  '#477666',
  '#79a285',
  '#b6cf95',
  '#c7ddaa',
  '#f5c55e',
  '#d98648',
  '#b74e45',
  '#e29192',
  '#79578c',
  '#bab0dc',
  '#ffffff',
  '#000000',
  '#4678c4',
  '#a64677',
];
export default function SkinEditor() {
  const mount = useRef<HTMLDivElement>(null),
    pixel = useRef<HTMLCanvasElement>(null),
    file = useRef<HTMLInputElement>(null);
  const data = useRef<SkinData | null>(null),
    model = useRef<SkinModel | null>(null),
    controls = useRef<OrbitControls | null>(null),
    undo = useRef<History[]>([]),
    redo = useRef<History[]>([]),
    drawing = useRef(false),
    strokeStart = useRef<[number, number] | null>(null),
    previous = useRef<[number, number] | null>(null),
    strokeImage = useRef<History | null>(null);
  const [state, setState] = useState<State>({
      part: 'head',
      face: 'front',
      layer: 0,
      tool: 'brush',
      color: '#79a285',
      size: 1,
      mirror: false,
    }),
    [revision, setRevision] = useState(0),
    [status, setStatus] = useState(
      'Edytuj piksele lub maluj bezpośrednio na modelu.',
    ),
    [capeEnabled, setCapeEnabled] = useState(true),
    [showBase, setShowBase] = useState(true),
    [showOuter, setShowOuter] = useState(true),
    [ready, setReady] = useState(false);
  const [undoCount, setUndoCount] = useState(0),
    [redoCount, setRedoCount] = useState(0);
  const refState = useRef(state);
  useEffect(() => {
    refState.current = state;
  }, [state]);
  const update = (s: Partial<State>) => setState((p) => ({ ...p, ...s }));
  const snapshot = (): History => ({
    skin: data.current!.skin.getContext('2d')!.getImageData(0, 0, 64, 64),
    cape: data.current!.cape.getContext('2d')!.getImageData(0, 0, 64, 32),
  });
  const restore = (h: History) => {
    data.current!.skin.getContext('2d')!.putImageData(h.skin, 0, 0);
    data.current!.cape.getContext('2d')!.putImageData(h.cape, 0, 0);
    refresh();
  };
  const refresh = () => {
    model.current?.refresh();
    setUndoCount(undo.current.length);
    setRedoCount(redo.current.length);
    setRevision((n) => n + 1);
  };
  const checkpoint = () => {
    if (!data.current) return;
    undo.current.push(snapshot());
    if (undo.current.length > 40) undo.current.shift();
    redo.current = [];
  };
  const undoPaint = () => {
    if (!undo.current.length) return;
    redo.current.push(snapshot());
    restore(undo.current.pop()!);
    setStatus('Cofnięto zmianę.');
  };
  const redoPaint = () => {
    if (!redo.current.length) return;
    undo.current.push(snapshot());
    restore(redo.current.pop()!);
    setStatus('Przywrócono zmianę.');
  };
  const paint = (
    gx: number,
    gy: number,
    bounds: [number, number, number, number],
    part: Part,
    tool = refState.current.tool,
  ) => {
    const d = data.current;
    if (!d) return;
    const s = refState.current,
      ctx = (part === 'cape' ? d.cape : d.skin).getContext('2d')!,
      [bx, by, bw, bh] = bounds;
    const px = Math.max(bx, Math.min(bx + bw - 1, gx)),
      py = Math.max(by, Math.min(by + bh - 1, gy));
    if (tool === 'pick') {
      const p = ctx.getImageData(px, py, 1, 1).data;
      update({
        color:
          '#' +
          Array.from(p.slice(0, 3))
            .map((x) => x.toString(16).padStart(2, '0'))
            .join(''),
        tool: 'brush',
      });
      return;
    }
    if (tool === 'fill') {
      const image = ctx.getImageData(bx, by, bw, bh),
        a = image.data,
        start = ((py - by) * bw + (px - bx)) * 4,
        match = Array.from(a.slice(start, start + 4)),
        rgb = s.color.match(/\w\w/g)!.map((x) => parseInt(x, 16)),
        queue = [[px - bx, py - by]],
        seen = new Set<number>();
      while (queue.length) {
        const [x, y] = queue.pop()!;
        if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
        const i = (y * bw + x) * 4;
        if (seen.has(i) || !match.every((v, j) => a[i + j] === v)) continue;
        seen.add(i);
        a.set([...rgb, 255], i);
        queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      ctx.putImageData(image, bx, by);
      refresh();
      return;
    }
    const stamp = (x: number, y: number) => {
      const half = Math.floor((s.size - 1) / 2);
      for (let dx = 0; dx < s.size; dx++)
        for (let dy = 0; dy < s.size; dy++) {
          const nx = x + dx - half,
            ny = y + dy - half;
          if (nx < bx || ny < by || nx >= bx + bw || ny >= by + bh) continue;
          if (tool === 'erase') ctx.clearRect(nx, ny, 1, 1);
          else {
            ctx.fillStyle = s.color;
            ctx.fillRect(nx, ny, 1, 1);
          }
          if (s.mirror) {
            const mx = bx + bw - 1 - (nx - bx);
            if (tool === 'erase') ctx.clearRect(mx, ny, 1, 1);
            else ctx.fillRect(mx, ny, 1, 1);
          }
        }
    };
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= steps; i++)
        stamp(
          Math.round(x0 + ((x1 - x0) * i) / steps),
          Math.round(y0 + ((y1 - y0) * i) / steps),
        );
    };
    if (tool === 'line' || tool === 'rect') {
      if (strokeImage.current) {
        d.skin.getContext('2d')!.putImageData(strokeImage.current.skin, 0, 0);
        d.cape.getContext('2d')!.putImageData(strokeImage.current.cape, 0, 0);
      }
      const start = strokeStart.current ?? [px, py];
      if (tool === 'line') line(start[0], start[1], px, py);
      else {
        line(start[0], start[1], px, start[1]);
        line(px, start[1], px, py);
        line(px, py, start[0], py);
        line(start[0], py, start[0], start[1]);
      }
    } else {
      const prev = previous.current;
      line(prev?.[0] ?? px, prev?.[1] ?? py, px, py);
      previous.current = [px, py];
    }
    refresh();
  };
  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  });
  useEffect(() => {
    let stop = false,
      renderer: THREE.WebGLRenderer,
      avatar: SkinModel,
      orbit: OrbitControls,
      raf = 0,
      observer: ResizeObserver;
    void readSkin().then((d) => {
      if (stop || !mount.current) return;
      data.current = d;
      setCapeEnabled(d.capeEnabled);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#18312c');
      const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
      camera.position.set(2.8, 1.9, 4.1);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      mount.current.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight('#f1fbf4', '#52644a', 2.8));
      const light = new THREE.DirectionalLight('#ffecd3', 3);
      light.position.set(3, 5, 4);
      light.castShadow = true;
      scene.add(light);
      const rim = new THREE.DirectionalLight('#9bbced', 2);
      rim.position.set(-3, 3, -2);
      scene.add(rim);
      avatar = new SkinModel(d);
      model.current = avatar;
      scene.add(avatar.group);
      const floor = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.35, 0.08, 48),
        new THREE.MeshStandardMaterial({ color: '#365146', roughness: 0.85 }),
      );
      floor.position.y = -0.045;
      floor.receiveShadow = true;
      scene.add(floor);
      orbit = new OrbitControls(camera, renderer.domElement);
      controls.current = orbit;
      orbit.target.set(0, 1, 0);
      orbit.enableDamping = true;
      orbit.enablePan = false;
      orbit.minDistance = 2;
      orbit.maxDistance = 7;
      orbit.maxPolarAngle = Math.PI * 0.85;
      orbit.mouseButtons = {
        LEFT: -1 as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      orbit.update();
      const resize = () => {
        if (!mount.current) return;
        const w = mount.current.clientWidth,
          h = mount.current.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize);
      observer.observe(mount.current);
      resize();
      const ray = new THREE.Raycaster();
      const point = (e: PointerEvent) => {
        const s = refState.current;
        if (s.tool === 'orbit') return;
        const rect = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(
          new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            (-(e.clientY - rect.top) / rect.height) * 2 + 1,
          ),
          camera,
        );
        const meshes = Array.from(avatar.parts.values()).filter(
          (m) =>
            m.visible &&
            (s.part === 'cape'
              ? m.userData.part === 'cape'
              : m.userData.part !== 'cape' && m.userData.layer === s.layer),
        );
        const hits = ray.intersectObjects(meshes);
        if (!hits.length || !hits[0].uv) return;
        const hit = hits[0],
          part = hit.object.userData.part as Part,
          normal = hit.face!.normal,
          face: Face =
            normal.x > 0.5
              ? 'right'
              : normal.x < -0.5
                ? 'left'
                : normal.y > 0.5
                  ? 'top'
                  : normal.y < -0.5
                    ? 'bottom'
                    : normal.z > 0.5
                      ? 'front'
                      : 'back';
        const x = Math.min(63, Math.floor(hit.uv!.x * 64)),
          y = Math.min(
            part === 'cape' ? 31 : 63,
            Math.floor((1 - hit.uv!.y) * (part === 'cape' ? 32 : 64)),
          );
        update({ part, face });
        if (!strokeStart.current) strokeStart.current = [x, y];
        paintRef.current(x, y, faceRect(part, face, s.layer), part);
      };
      const down = (e: PointerEvent) => {
        if (e.button !== 0 || refState.current.tool === 'orbit') return;
        renderer.domElement.setPointerCapture(e.pointerId);
        drawing.current = true;
        previous.current = null;
        strokeStart.current = null;
        checkpoint();
        strokeImage.current = snapshot();
        point(e);
      };
      const move = (e: PointerEvent) => {
        if (
          drawing.current &&
          !['fill', 'pick'].includes(refState.current.tool)
        )
          point(e);
      };
      const up = () => {
        if (!drawing.current) return;
        drawing.current = false;
        previous.current = null;
        strokeStart.current = null;
        setStatus('Zmiany gotowe. Zapisz skórkę, aby używać jej w grze.');
      };
      renderer.domElement.addEventListener('pointerdown', down);
      renderer.domElement.addEventListener('pointermove', move);
      renderer.domElement.addEventListener('pointerup', up);
      renderer.domElement.addEventListener('pointercancel', up);
      const frame = () => {
        raf = requestAnimationFrame(frame);
        orbit.update();
        avatar.capePivot.rotation.x =
          0.16 + Math.sin(performance.now() * 0.002) * 0.04;
        renderer.render(scene, camera);
      };
      frame();
      setReady(true);
      refresh();
    });
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      orbit?.dispose();
      avatar?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);
  useEffect(() => {
    if (!pixel.current || !data.current) return;
    const c = pixel.current,
      [x, y, w, h] = faceRect(state.part, state.face, state.layer);
    c.width = w * 24;
    c.height = h * 24;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    for (let dx = 0; dx < w; dx++)
      for (let dy = 0; dy < h; dy++) {
        ctx.fillStyle = (dx + dy) % 2 ? '#41594d' : '#354d42';
        ctx.fillRect(dx * 24, dy * 24, 24, 24);
      }
    ctx.drawImage(
      state.part === 'cape' ? data.current.cape : data.current.skin,
      x,
      y,
      w,
      h,
      0,
      0,
      c.width,
      c.height,
    );
    ctx.strokeStyle = '#11291f50';
    ctx.lineWidth = 1;
    for (let dx = 0; dx <= w; dx++) {
      ctx.beginPath();
      ctx.moveTo(dx * 24, 0);
      ctx.lineTo(dx * 24, c.height);
      ctx.stroke();
    }
    for (let dy = 0; dy <= h; dy++) {
      ctx.beginPath();
      ctx.moveTo(0, dy * 24);
      ctx.lineTo(c.width, dy * 24);
      ctx.stroke();
    }
  }, [state.part, state.face, state.layer, revision, ready]);
  useEffect(() => {
    if (!model.current) return;
    model.current.parts.forEach((m) => {
      if (m.userData.part !== 'cape')
        m.visible = m.userData.layer === 0 ? showBase : showOuter;
    });
    model.current.capePivot.visible = capeEnabled;
    if (data.current) data.current.capeEnabled = capeEnabled;
  }, [showBase, showOuter, capeEnabled, ready]);
  useEffect(() => {
    if (controls.current)
      controls.current.mouseButtons.LEFT =
        state.tool === 'orbit' ? THREE.MOUSE.ROTATE : (-1 as THREE.MOUSE);
  }, [state.tool]);
  const pixelPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(),
      bounds = faceRect(state.part, state.face, state.layer),
      x = bounds[0] + Math.floor(((e.clientX - r.left) / r.width) * bounds[2]),
      y = bounds[1] + Math.floor(((e.clientY - r.top) / r.height) * bounds[3]);
    if (!strokeStart.current) strokeStart.current = [x, y];
    paint(x, y, bounds, state.part);
  };
  const exportPng = () => {
    if (!data.current) return;
    const a = document.createElement('a');
    a.download =
      state.part === 'cape' ? 'blockland-cape.png' : 'blockland-skin.png';
    a.href = (
      state.part === 'cape' ? data.current.cape : data.current.skin
    ).toDataURL('image/png');
    a.click();
  };
  const importPng = (f: File) => {
    if (f.size > 3_000_000) {
      setStatus('Plik jest zbyt duży (maks. 3 MB).');
      return;
    }
    const image = new Image(),
      url = URL.createObjectURL(f);
    image.onload = () => {
      const h = state.part === 'cape' ? 32 : 64;
      if (image.width !== 64 || image.height !== h) {
        setStatus(`Wymagany plik PNG 64 × ${h} piksele.`);
      } else {
        checkpoint();
        const c =
            state.part === 'cape' ? data.current!.cape : data.current!.skin,
          ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, 64, h);
        ctx.drawImage(image, 0, 0);
        refresh();
        setStatus('Wczytano teksturę. Możesz ją dalej edytować.');
      }
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus('Nie udało się odczytać obrazu PNG.');
    };
    image.src = url;
  };
  return (
    <div className="skin-editor">
      <Tabs
        value={state.part === 'cape' ? 'cape' : String(state.layer)}
        onValueChange={(v) => {
          update(
            v === 'cape'
              ? { part: 'cape', layer: 0 }
              : {
                  part: state.part === 'cape' ? 'head' : state.part,
                  layer: Number(v),
                },
          );
          if (v === 'cape') setCapeEnabled(true);
        }}
      >
        <TabsList className="inventory-tabs">
          <TabsTrigger value="0">Warstwa podstawowa</TabsTrigger>
          <TabsTrigger value="1">Warstwa zewnętrzna</TabsTrigger>
          <TabsTrigger value="cape">Peleryna</TabsTrigger>
        </TabsList>
        <TabsContent value="0" className="skin-layer-info">
          Skóra i bazowe ubranie · 64 × 64 px
        </TabsContent>
        <TabsContent value="1" className="skin-layer-info">
          Dodatkowa warstwa na ubranie, włosy i detale · obsługuje
          przezroczystość
        </TabsContent>
        <TabsContent value="cape" className="skin-layer-info">
          Twoja własna peleryna · 64 × 32 px
        </TabsContent>
      </Tabs>
      <div className="skin-workspace">
        <div className="skin-preview">
          <div ref={mount} className="skin-stage" />
          <div className="skin-preview-label">
            PODGLĄD 3D{' '}
            <span>PPM / wciśnięte kółko: obrót · Scroll: zbliżenie</span>
          </div>
          <div className="skin-visibility">
            <label htmlFor="skin-base">
              Baza{' '}
              <Switch
                id="skin-base"
                checked={showBase}
                onCheckedChange={setShowBase}
              />
            </label>
            <label htmlFor="skin-outer">
              Warstwa 2{' '}
              <Switch
                id="skin-outer"
                checked={showOuter}
                onCheckedChange={setShowOuter}
              />
            </label>
            <label htmlFor="skin-cape">
              Peleryna{' '}
              <Switch
                id="skin-cape"
                checked={capeEnabled}
                onCheckedChange={setCapeEnabled}
              />
            </label>
          </div>
        </div>
        <div className="pixel-editor">
          <div className="part-pills">
            {(Object.keys(PART_NAMES) as Part[])
              .filter((p) =>
                state.part === 'cape' ? p === 'cape' : p !== 'cape',
              )
              .map((p) => (
                <button
                  key={p}
                  className={state.part === p ? 'active' : ''}
                  onClick={() => update({ part: p })}
                >
                  {PART_NAMES[p]}
                </button>
              ))}
          </div>
          <div className="face-pills">
            {(Object.keys(FACE_NAMES) as Face[]).map((f) => (
              <button
                key={f}
                className={state.face === f ? 'active' : ''}
                onClick={() => update({ face: f })}
              >
                {FACE_NAMES[f]}
              </button>
            ))}
          </div>
          <div className="pixel-stage">
            <canvas
              ref={pixel}
              aria-label="Płótno edycji pikseli skórki"
              onPointerDown={(e) => {
                if (state.tool === 'orbit') return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                drawing.current = true;
                previous.current = null;
                strokeStart.current = null;
                checkpoint();
                strokeImage.current = snapshot();
                pixelPoint(e);
              }}
              onPointerMove={(e) => {
                if (drawing.current && !['fill', 'pick'].includes(state.tool))
                  pixelPoint(e);
              }}
              onPointerUp={() => {
                drawing.current = false;
                previous.current = null;
                strokeStart.current = null;
                setStatus(
                  'Zmiany gotowe. Zapisz skórkę, aby używać jej w grze.',
                );
              }}
              onPointerCancel={() => {
                drawing.current = false;
                previous.current = null;
              }}
            />
          </div>
          <div className="tool-row">
            {toolsList.map((t) => (
              <button
                title={t.name}
                aria-label={t.name}
                key={t.id}
                className={state.tool === t.id ? 'active' : ''}
                onClick={() => update({ tool: t.id })}
              >
                <t.icon size={18} />
              </button>
            ))}
            <button
              title="Cofnij"
              aria-label="Cofnij"
              onClick={undoPaint}
              disabled={!undoCount}
            >
              <Undo2 size={18} />
            </button>
            <button
              title="Ponów"
              aria-label="Ponów"
              onClick={redoPaint}
              disabled={!redoCount}
            >
              <Redo2 size={18} />
            </button>
          </div>
        </div>
        <aside className="skin-colors">
          <label className="color-input">
            Kolor
            <input
              aria-label="Kolor rysowania"
              type="color"
              value={state.color}
              onChange={(e) => update({ color: e.target.value })}
            />
            <span>{state.color.toUpperCase()}</span>
          </label>
          <div className="palette">
            {palette.map((c) => (
              <button
                key={c}
                aria-label={`Kolor ${c}`}
                title={c}
                style={{ background: c }}
                className={state.color === c ? 'active' : ''}
                onClick={() => update({ color: c })}
              />
            ))}
          </div>
          <div className="brush-size">
            <label id="brush-label">
              Rozmiar <b>{state.size} px</b>
            </label>
            <Slider
              aria-labelledby="brush-label"
              value={[state.size]}
              min={1}
              max={4}
              step={1}
              onValueChange={(v) =>
                update({ size: Array.isArray(v) ? v[0] : v })
              }
            />
          </div>
          <label className="mirror-setting" htmlFor="skin-mirror">
            Odbicie lustrzane
            <Switch
              id="skin-mirror"
              checked={state.mirror}
              onCheckedChange={(mirror) => update({ mirror })}
            />
          </label>
          <button
            className="quiet-action"
            onClick={() => {
              checkpoint();
              const fresh = defaultSkin();
              data.current!.skin.getContext('2d')!.clearRect(0, 0, 64, 64);
              data.current!.skin.getContext('2d')!.drawImage(fresh.skin, 0, 0);
              data.current!.cape.getContext('2d')!.drawImage(fresh.cape, 0, 0);
              refresh();
            }}
          >
            <RotateCcw size={15} />
            Domyślna skórka
          </button>
        </aside>
      </div>
      <div className="skin-footer">
        <output>{status}</output>
        <div>
          <button
            className="quiet-action"
            onClick={() => file.current?.click()}
          >
            <Upload size={16} />
            Import PNG
          </button>
          <button className="quiet-action" onClick={exportPng}>
            <Download size={16} />
            Eksport PNG
          </button>
          <button
            className="primary-action"
            disabled={!ready}
            onClick={() => {
              try {
                const persistent = saveSkin(data.current!);
                setStatus(
                  persistent
                    ? 'Skórka i peleryna zapisane. Są już dostępne w grze.'
                    : 'Skórka działa w tej sesji. Zapis przeglądarki niedostępny — wyeksportuj PNG.',
                );
              } catch {
                setStatus(
                  'Brak miejsca na zapis. Wyeksportuj skórkę jako PNG.',
                );
              }
            }}
          >
            <Check size={17} />
            Zapisz skórkę
          </button>
        </div>
      </div>
      <section className="skin-presets">
        <h3>Wybierz gotową skórkę</h3>
        <p>
          Punkt wyjścia do Twojej własnej postaci. Każdą skórkę można dalej
          edytować.
        </p>
        <div>
          {SKIN_PRESETS.map((p, i) => (
            <button
              key={p.name}
              disabled={!ready}
              onClick={() => {
                if (!data.current) return;
                checkpoint();
                const fresh = presetSkin(i);
                for (const part of ['skin', 'cape'] as const) {
                  const c = data.current[part],
                    ctx = c.getContext('2d')!;
                  ctx.clearRect(0, 0, c.width, c.height);
                  ctx.drawImage(fresh[part], 0, 0);
                }
                data.current.capeEnabled = true;
                setCapeEnabled(true);
                refresh();
                saveSkin(data.current);
                setStatus(
                  'Wybrano skórkę: ' + p.name + '. Możesz ją dalej edytować.',
                );
              }}
            >
              <svg viewBox="0 0 32 40" aria-hidden="true">
                <rect x="10" y="2" width="12" height="12" fill={p.skin} />
                <path d="M10 2h12v4H10z" fill={p.hair} />
                <path d="M12 8h2v2h-2zm6 0h2v2h-2z" fill="#23312e" />
                <path
                  d="M9 15h14v15H9zm-6 0h5v12H3zm21 0h5v12h-5z"
                  fill={p.shirt}
                />
                <path d="M10 30h5v9h-5zm7 0h5v9h-5z" fill={p.pants} />
                <path d="M9 25h14v2H9z" fill={p.accent} />
              </svg>
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </section>
      <input
        ref={file}
        hidden
        type="file"
        accept="image/png"
        onChange={(e) => {
          if (e.target.files?.[0]) importPng(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
export function InventoryAvatar({ heldId = 0, faceTexture = null, equipment = null }: { heldId?: number; faceTexture?: THREE.Texture | null; equipment?: import("@/lib/armor").Equipment | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const held = useRef(heldId);
  held.current = heldId;
  const face = useRef(faceTexture);
  face.current = faceTexture;
  const worn = useRef(equipment);
  worn.current = equipment;
  useEffect(() => {
    let stopped = false,
      renderer: THREE.WebGLRenderer,
      avatar: SkinModel,
      raf = 0;
    const target = new THREE.Vector2();
    const move = (e: MouseEvent) => {
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      target.set(
        Math.max(-0.8, Math.min(0.8, (e.clientX - r.left - r.width / 2) / 300)),
        Math.max(
          -0.5,
          Math.min(0.5, (e.clientY - r.top - r.height * 0.35) / 300),
        ),
      );
    };
    void readSkin().then((data) => {
      if (stopped || !ref.current) return;
      const scene = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
      camera.position.set(0, 1.25, 4.2);
      camera.lookAt(0, 1, 0);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(200, 260);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      ref.current.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight('#ffffff', '#618b68', 3));
      const l = new THREE.DirectionalLight('#ffe5bc', 2);
      l.position.set(-2, 4, 3);
      scene.add(l);
      avatar = new SkinModel(data);
      scene.add(avatar.group);
      const frame = () => {
        raf = requestAnimationFrame(frame);
        avatar.head.rotation.y += (target.x - avatar.head.rotation.y) * 0.12;
        avatar.head.rotation.x += (target.y - avatar.head.rotation.x) * 0.12;
        avatar.group.rotation.y = target.x * 0.25;
        avatar.pose(performance.now() / 1000);
        avatar.setHeldItem(held.current);
        avatar.setFaceTexture(face.current);
        avatar.setEquipment(worn.current);
        renderer.render(scene, camera);
      };
      frame();
    });
    window.addEventListener('mousemove', move);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', move);
      avatar?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);
  return (
    <div
      ref={ref}
      className="inventory-avatar"
      aria-label="Model gracza podążający wzrokiem za kursorem"
    >
      <span>TWÓJ ODKRYWCA</span>
    </div>
  );
}
