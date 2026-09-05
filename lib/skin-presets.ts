import { defaultSkin, PARTS, FACE_NAMES, faceRect, type Part, type Face } from "./skin-model";
export const SKIN_PRESETS = [
  {
    name: "Odkrywca",
    shirt: "#588b82",
    pants: "#314955",
    skin: "#b88663",
    hair: "#4b3930",
    accent: "#d9c38e",
  },
  {
    name: "Leśniczka",
    shirt: "#66834b",
    pants: "#54473e",
    skin: "#e0b08a",
    hair: "#a34d2e",
    accent: "#ceb467",
  },
  {
    name: "Górnik",
    shirt: "#9c6746",
    pants: "#425b72",
    skin: "#c69370",
    hair: "#362d29",
    accent: "#e9c43f",
  },
  {
    name: "Astronauta",
    shirt: "#dededa",
    pants: "#b5bfc2",
    skin: "#bd9175",
    hair: "#343647",
    accent: "#f49a48",
  },
  {
    name: "Mag",
    shirt: "#73539a",
    pants: "#453768",
    skin: "#d5a38a",
    hair: "#dde0d6",
    accent: "#e4c668",
  },
  {
    name: "Pirat",
    shirt: "#9b4240",
    pants: "#36373c",
    skin: "#ba8060",
    hair: "#25272b",
    accent: "#eddac2",
  },
  {
    name: "Rycerz",
    shirt: "#78949e",
    pants: "#506671",
    skin: "#d2a47f",
    hair: "#69503f",
    accent: "#c7d9df",
  },
  {
    name: "Pszczelarz",
    shirt: "#d9b845",
    pants: "#5b523e",
    skin: "#e1b492",
    hair: "#5b402b",
    accent: "#332f27",
  },
];
export function presetSkin(index: number) {
  const p = SKIN_PRESETS[index] ?? SKIN_PRESETS[0],
    data = defaultSkin(),
    ctx = data.skin.getContext("2d")!;
  ctx.clearRect(0, 0, 64, 64);
  for (const part of Object.keys(PARTS) as Part[])
    for (const face of Object.keys(FACE_NAMES) as Face[]) {
      const [x, y, w, h] = faceRect(part, face, 0);
      ctx.fillStyle = part === "head" ? p.skin : part.startsWith("leg") ? p.pants : p.shirt;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#ffffff12";
      for (let py = 1; py < h; py += 3) ctx.fillRect(x, y + py, w, 1);
      if (part.startsWith("arm") && face !== "top") {
        ctx.fillStyle = p.skin;
        ctx.fillRect(x, y + h - 4, w, 4);
      }
      if (part.startsWith("leg") && face !== "top") {
        ctx.fillStyle = "#2a3034";
        if (face === "bottom") ctx.fillRect(x, y, w, h);
        else ctx.fillRect(x, y + h - 2, w, 2);
      }
      if (part === "body" && face === "top") {
        ctx.fillStyle = p.skin;
        ctx.fillRect(x + 2, y, w - 4, h);
      }
      if (part === "body" && face !== "top" && face !== "bottom") {
        ctx.fillStyle = p.accent;
        ctx.fillRect(x, y + h - 3, w, 1);
        if (face === "front") {
          ctx.fillRect(x + 3, y + 3, 2, 3);
          ctx.fillRect(x + 2, y + 4, 4, 1);
        }
      }
      if (part === "head") {
        ctx.fillStyle = p.hair;
        if (face === "top" || face === "back") ctx.fillRect(x, y, w, h);
        else if (face !== "bottom") {
          ctx.fillRect(x, y, w, 2);
          if (face === "front") {
            ctx.fillRect(x, y + 2, 2, 1);
            ctx.fillStyle = "#f2eee2";
            ctx.fillRect(x + 1, y + 4, 2, 1);
            ctx.fillRect(x + 5, y + 4, 2, 1);
            ctx.fillStyle = "#304757";
            ctx.fillRect(x + 2, y + 4, 1, 1);
            ctx.fillRect(x + 5, y + 4, 1, 1);
            ctx.fillStyle = "#895a47";
            ctx.fillRect(x + 3, y + 6, 2, 1);
            if (index === 5) {
              ctx.fillStyle = "#24262c";
              ctx.fillRect(x + 1, y + 3, 3, 2);
            }
          }
        }
        if (index >= 2) {
          const [ox, oy, ow, oh] = faceRect(part, face, 1);
          ctx.fillStyle = index === 3 ? "#c7d8dc" : index === 4 ? p.shirt : p.accent;
          if (face === "top") ctx.fillRect(ox, oy, ow, oh);
          else if (face !== "bottom") {
            ctx.fillRect(ox, oy, ow, 2);
            if (index === 3 || index === 4) {
              ctx.fillRect(ox, oy, 1, oh);
              ctx.fillRect(ox + ow - 1, oy, 1, oh);
            }
          }
        }
      }
    }
  const cape = data.cape.getContext("2d")!;
  cape.fillStyle = p.pants;
  cape.fillRect(0, 0, 64, 32);
  for (const face of ["front", "back"] as Face[]) {
    const [x, y, w, h] = faceRect("cape", face, 0);
    cape.fillStyle = p.accent;
    cape.fillRect(x, y + h - 2, w, 1);
    cape.fillRect(x + 3, y + 4, 4, 7);
    cape.fillStyle = p.shirt;
    cape.fillRect(x + 4, y + 5, 2, 5);
  }
  data.capeEnabled = true;
  return data;
}
