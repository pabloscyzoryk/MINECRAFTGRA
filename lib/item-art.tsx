import { BLOCKS, item } from "./blocks";
import { hash } from "./world";
import { armorInfo } from "./armor";
import { drawChestIcon } from "./chest-texture";
import { drawBedIcon } from "./bed-texture";
import { canonicalBlock, SHAPES, shapeFaces } from "./block-shapes";
const cache = new Map<number, string>();
/** Project real visible slab/stair surfaces, preserving the missing half and the step. */
function drawShapedIcon(c: CanvasRenderingContext2D, id: number) {
  const shape = SHAPES[id],
    base = BLOCKS[shape.base];
  const project = ([x, y, z]: readonly number[]) => [
    24 + (x - z) * 20,
    (shape.kind === "slab" ? 18.75 : 24) + (x + z) * 11 - y * 21,
  ];
  const faces = shapeFaces(id)
    .filter((f) => [0, 2, 4].includes(f.face))
    .slice();
  faces.sort((a, b) => {
    const depth = (f: typeof a) => f.vertices.reduce((sum, p) => sum + p[0] + p[2] + p[1] * 2, 0);
    return depth(a) - depth(b);
  });
  for (const face of faces) {
    const vertices = face.vertices.map(project);
    c.save();
    c.beginPath();
    vertices.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = face.face === 2 ? (base.top ?? base.color) : base.color;
    c.fill();
    c.strokeStyle = "#342d2799";
    c.lineWidth = 1.5;
    c.stroke();
    c.clip();
    c.fillStyle = face.face === 0 ? "#00000032" : face.face === 2 ? "#ffffff16" : "#0000000a";
    c.fillRect(0, 0, 48, 48);
    c.fillStyle = "#ffffff28";
    for (let n = 0; n < 13; n++) c.fillRect(5 + hash(n, id) * 37, 4 + hash(n, id + 4) * 40, 3, 1.5);
    if (shape.base === 8) {
      c.strokeStyle = "#72523588";
      c.lineWidth = 1;
      for (let y = 5; y < 50; y += 7) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(48, y + (face.face === 0 ? -26 : 26));
        c.stroke();
      }
    }
    c.restore();
  }
}
export function itemArt(id: number): string {
  id = canonicalBlock(id);
  const old = cache.get(id);
  if (old) return old;
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  const color = item(id).color;
  const rect = (x: number, y: number, w: number, h: number, v: string) => {
    c.fillStyle = v;
    c.fillRect(x, y, w, h);
  };
  const path = (points: number[][], fill: string, outline = "#17211f") => {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = outline;
    c.lineWidth = 2;
    c.stroke();
  };
  if (id === 61) {
    drawChestIcon(c);
  } else if (id === 62) {
    drawBedIcon(c);
  } else if (SHAPES[id]) {
    drawShapedIcon(c, id);
  } else if (id > 0 && !!BLOCKS[id]) {
    path(
      [
        [24, 3],
        [44, 14],
        [24, 25],
        [4, 14],
      ],
      BLOCKS[id].top ?? color,
    );
    path(
      [
        [4, 14],
        [24, 25],
        [24, 46],
        [4, 35],
      ],
      color,
    );
    path(
      [
        [24, 25],
        [44, 14],
        [44, 35],
        [24, 46],
      ],
      color,
    );
    c.save();
    c.beginPath();
    c.moveTo(4, 14);
    c.lineTo(24, 25);
    c.lineTo(24, 46);
    c.lineTo(4, 35);
    c.clip();
    for (let i = 0; i < 24; i++) {
      rect(
        4 + hash(i, id) * 20,
        16 + hash(i, id + 9) * 28,
        3,
        2,
        hash(i, id + 2) > 0.5 ? "#ffffff27" : "#0000003b",
      );
    }
    if ([5, 25, 43, 47, 49, 52, 76].includes(id)) {
      for (let x = 6; x < 25; x += 5) rect(x, 18, 2, 32, "#30201470");
    }
    if ([8, 44, 51, 78, 86, 11, 27, 38, 39, 83, 85].includes(id)) {
      c.strokeStyle = "#16252177";
      c.lineWidth = 1.5;
      for (let y = 17; y < 48; y += 7) {
        c.beginPath();
        c.moveTo(3, y);
        c.lineTo(25, y + 12);
        c.stroke();
      }
    }
    if ([20, 21, 22, 23, 80, 87, 88, 89, 90, 91, 92, 93].includes(id)) {
      const ore = (
        {
          20: "#181b21",
          21: "#d9c0a4",
          22: "#60ffe1",
          23: "#eed365",
          80: "#f09c63",
          87: "#f7d76e",
          88: "#fc4746",
          89: "#3978f3",
          90: "#54e795",
          91: "#f5eae2",
          92: "#ab8470",
          93: "#ffc251",
        } as Record<number, string>
      )[id];
      rect(9, 26, 5, 4, ore);
      rect(17, 34, 4, 5, ore);
      rect(7, 34, 3, 3, ore);
    }
    c.restore();
    path(
      [
        [24, 25],
        [44, 14],
        [44, 35],
        [24, 46],
      ],
      "#00000025",
      "transparent",
    );
    if (id === 29) {
      rect(9, 27, 12, 9, "#101b20");
      rect(11, 32, 8, 3, "#e88c48");
    }
    if (id === 28) {
      c.strokeStyle = "#65482e";
      c.lineWidth = 2;
      for (let i = -1; i < 2; i++) {
        c.beginPath();
        c.moveTo(14 + i * 6, 9 + i * 3);
        c.lineTo(34 + i * 6, 20 + i * 3);
        c.stroke();
      }
    }
    if (id === 48) {
      c.clearRect(0, 0, 48, 48);
      rect(20, 17, 8, 28, "#78512c");
      rect(22, 18, 3, 25, "#b0874a");
      path(
        [
          [24, 2],
          [33, 14],
          [29, 24],
          [18, 23],
          [14, 14],
        ],
        "#ffb34f",
      );
      rect(21, 12, 6, 11, "#fff2a0");
    }
    if (BLOCKS[id].plant) {
      c.clearRect(0, 0, 48, 48);
      rect(22, 19, 4, 26, "#64884b");
      path(
        [
          [24, 31],
          [6, 18],
          [6, 29],
          [24, 37],
        ],
        color,
      );
      path(
        [
          [25, 28],
          [42, 11],
          [41, 27],
          [25, 37],
        ],
        color,
      );
      if ([64, 65, 66, 79].includes(id)) {
        for (let y = 6; y < 30; y += 7) {
          rect(16, y, 7, 5, color);
          rect(26, y + 3, 6, 5, color);
        }
      }
    }
  } else if (armorInfo(id)) {
    const slot = armorInfo(id)!.slot;
    if (slot === "head") {
      path(
        [
          [9, 7],
          [37, 7],
          [43, 15],
          [43, 37],
          [33, 41],
          [32, 22],
          [16, 22],
          [15, 41],
          [5, 37],
          [5, 15],
        ],
        color,
      );
      rect(11, 10, 25, 4, "#ffffff55");
      rect(10, 17, 28, 5, "#24384133");
    } else if (slot === "chest") {
      path(
        [
          [12, 6],
          [19, 6],
          [21, 14],
          [28, 14],
          [30, 6],
          [36, 6],
          [45, 18],
          [37, 25],
          [33, 22],
          [34, 43],
          [14, 43],
          [15, 22],
          [11, 25],
          [3, 18],
        ],
        color,
      );
      rect(19, 18, 10, 19, "#ffffff45");
      rect(15, 36, 18, 5, "#27425355");
    } else if (slot === "legs") {
      path(
        [
          [9, 5],
          [39, 5],
          [37, 44],
          [26, 44],
          [25, 20],
          [22, 20],
          [21, 44],
          [10, 44],
        ],
        color,
      );
      rect(10, 8, 28, 5, "#24384166");
      rect(13, 17, 4, 21, "#ffffff45");
      rect(28, 17, 4, 21, "#ffffff45");
      rect(22, 8, 5, 4, "#e4dab9");
    } else {
      path(
        [
          [9, 8],
          [21, 8],
          [21, 42],
          [3, 42],
          [3, 32],
          [9, 29],
        ],
        color,
      );
      path(
        [
          [29, 8],
          [41, 8],
          [41, 29],
          [46, 32],
          [46, 42],
          [27, 42],
        ],
        color,
      );
      rect(4, 37, 16, 5, "#24384166");
      rect(28, 37, 17, 5, "#24384166");
      rect(11, 11, 4, 17, "#ffffff55");
      rect(31, 11, 4, 17, "#ffffff55");
    }
  } else if (
    [
      101, 102, 103, 104, 108, 118, 127, 128, 129, 130, 131, 155, 156, 157, 158, 159, 160, 161, 162,
    ].includes(id)
  ) {
    c.save();
    c.translate(24, 24);
    c.rotate(Math.PI / 4);
    c.translate(-24, -24);
    rect(21, 18, 7, 27, "#38291c");
    rect(22, 18, 4, 26, "#a47b45");
    rect(23, 21, 2, 20, "#c89b58");
    if ([101, 102, 103, 131, 155].includes(id)) {
      path(
        [
          [8, 10],
          [32, 6],
          [39, 12],
          [42, 23],
          [35, 20],
          [31, 13],
          [8, 16],
        ],
        color,
      );
      rect(12, 9, 20, 3, "#ffffff55");
    } else if ([104, 108, 129, 156].includes(id)) {
      path(
        [
          [24, 1],
          [29, 7],
          [28, 29],
          [20, 29],
          [20, 7],
        ],
        color,
      );
      rect(24, 6, 3, 22, "#ffffff70");
      if (id !== 129) {
        rect(14, 28, 20, 5, "#3c6668");
        rect(15, 28, 18, 2, "#8ec7c0");
      } else rect(20, 29, 8, 4, "#9d8456");
    } else if ([127, 128, 157, 160].includes(id)) {
      path(
        [
          [9, 5],
          [24, 9],
          [27, 22],
          [9, 25],
          [5, 18],
          [5, 10],
        ],
        color,
      );
      rect(6, 10, 4, 10, "#ffffff80");
    } else if ([130, 158, 161].includes(id))
      path(
        [
          [16, 4],
          [31, 4],
          [32, 14],
          [24, 21],
          [15, 14],
        ],
        color,
      );
    else {
      path(
        [
          [9, 8],
          [32, 8],
          [32, 22],
          [25, 22],
          [25, 14],
          [9, 14],
        ],
        color,
      );
    }
    c.restore();
  } else if (id === 132) {
    path(
      [
        [22, 29],
        [6, 3],
        [8, 20],
        [19, 34],
      ],
      "#a1afb3",
    );
    path(
      [
        [25, 29],
        [42, 3],
        [38, 21],
        [27, 34],
      ],
      "#d7e0df",
    );
    path(
      [
        [38, 9],
        [27, 29],
        [29, 25],
      ],
      "#ffffffa0",
      "transparent",
    );
    for (const x of [14, 34]) {
      c.beginPath();
      c.arc(x, 36, 7, 0, Math.PI * 2);
      c.strokeStyle = "#17211f";
      c.lineWidth = 8;
      c.stroke();
      c.strokeStyle = "#995d4d";
      c.lineWidth = 5;
      c.stroke();
    }
    rect(21, 26, 7, 7, "#43575d");
    rect(23, 27, 3, 3, "#e5ece8");
  } else if (id === 105) {
    c.strokeStyle = "#33271b";
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(12, 4);
    c.quadraticCurveTo(50, 24, 12, 44);
    c.stroke();
    c.strokeStyle = "#bf9456";
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = "#efe6c9";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(12, 4);
    c.lineTo(12, 44);
    c.stroke();
    rect(9, 22, 28, 3, "#a88750");
    path(
      [
        [42, 23],
        [34, 17],
        [34, 29],
      ],
      "#d4e4e4",
    );
  } else if (id === 106) {
    path(
      [
        [24, 14],
        [12, 11],
        [5, 20],
        [8, 35],
        [18, 43],
        [25, 39],
        [33, 43],
        [42, 31],
        [42, 20],
        [34, 12],
      ],
      "#d95740",
    );
    rect(12, 18, 5, 11, "#ffb095");
    rect(23, 4, 4, 12, "#785534");
    path(
      [
        [26, 9],
        [34, 3],
        [40, 5],
        [33, 12],
      ],
      "#71ae57",
    );
  } else if (id === 107) {
    path(
      [
        [4, 23],
        [11, 12],
        [30, 9],
        [41, 17],
        [44, 28],
        [34, 38],
        [11, 38],
        [4, 32],
      ],
      "#c58b42",
    );
    rect(11, 29, 26, 6, "#8e5e31");
    for (let x = 14; x < 37; x += 8) {
      c.strokeStyle = "#f4d194";
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(x, 14);
      c.lineTo(x - 4, 23);
      c.stroke();
    }
  } else if ([110, 120, 133, 139].includes(id)) {
    path(
      [
        [8, 14],
        [36, 14],
        [44, 27],
        [38, 36],
        [7, 36],
        [3, 28],
      ],
      color,
    );
    path(
      [
        [8, 14],
        [36, 14],
        [34, 25],
        [9, 25],
      ],
      "#ffffff65",
    );
    path(
      [
        [9, 25],
        [34, 25],
        [38, 36],
        [7, 36],
      ],
      color,
    );
  } else if (id === 134) {
    path(
      [
        [7, 38],
        [13, 30],
        [20, 28],
        [22, 20],
        [27, 26],
        [33, 29],
        [41, 39],
        [35, 44],
        [13, 44],
      ],
      "#b82c33",
    );
    for (const [x, y] of [
      [8, 24],
      [16, 17],
      [28, 13],
      [35, 22],
      [21, 36],
      [31, 34],
    ]) {
      path(
        [
          [x, y],
          [x + 4, y - 3],
          [x + 7, y + 2],
          [x + 2, y + 6],
        ],
        "#ef5355",
      );
    }
  } else if (id === 135 || id === 136 || id === 137) {
    if (id === 136) {
      path(
        [
          [16, 3],
          [33, 3],
          [40, 13],
          [40, 34],
          [31, 45],
          [16, 45],
          [8, 34],
          [8, 14],
        ],
        color,
      );
      path(
        [
          [17, 10],
          [30, 10],
          [33, 16],
          [33, 32],
          [28, 38],
          [19, 38],
          [15, 31],
          [15, 16],
        ],
        "#a5ffd166",
      );
      rect(12, 14, 4, 18, "#d0ffe1");
    } else if (id === 137) {
      path(
        [
          [9, 33],
          [13, 9],
          [23, 2],
          [30, 11],
          [29, 24],
          [36, 13],
          [43, 23],
          [36, 39],
          [20, 46],
        ],
        color,
      );
      path(
        [
          [14, 11],
          [23, 3],
          [21, 35],
          [11, 33],
        ],
        "#fffdf6",
      );
      path(
        [
          [21, 35],
          [29, 24],
          [36, 15],
          [32, 35],
          [20, 45],
        ],
        "#b3a3a0",
      );
    } else {
      path(
        [
          [8, 13],
          [22, 5],
          [32, 11],
          [30, 23],
          [42, 28],
          [34, 43],
          [17, 41],
          [6, 30],
        ],
        color,
      );
      path(
        [
          [10, 14],
          [22, 7],
          [20, 24],
          [8, 28],
        ],
        "#6f9bfb",
      );
      path(
        [
          [21, 25],
          [29, 24],
          [39, 29],
          [31, 39],
        ],
        "#173e99",
      );
      rect(13, 17, 3, 3, "#ead586");
      rect(25, 32, 3, 3, "#ead586");
    }
  } else if (id === 138) {
    path(
      [
        [7, 11],
        [19, 6],
        [26, 13],
        [36, 8],
        [43, 21],
        [34, 29],
        [40, 38],
        [26, 43],
        [17, 35],
        [6, 38],
        [10, 24],
      ],
      color,
    );
    path(
      [
        [12, 14],
        [19, 10],
        [27, 19],
        [22, 30],
        [12, 27],
      ],
      "#bd8668",
    );
    rect(29, 20, 6, 4, "#302e35");
    rect(17, 32, 9, 4, "#302e35");
  } else if (id === 140) {
    path(
      [
        [5, 10],
        [14, 5],
        [21, 10],
        [30, 7],
        [42, 12],
        [35, 21],
        [39, 35],
        [30, 42],
        [22, 37],
        [13, 43],
        [5, 34],
        [10, 24],
      ],
      color,
    );
    path(
      [
        [13, 13],
        [21, 17],
        [31, 13],
        [29, 27],
        [33, 34],
        [22, 32],
        [13, 36],
        [16, 25],
      ],
      "#c18a54",
    );
    rect(11, 18, 2, 5, "#6c4228");
    rect(30, 29, 2, 5, "#6c4228");
  } else if (id === 111) {
    path(
      [
        [12, 6],
        [35, 6],
        [44, 19],
        [24, 44],
        [4, 19],
      ],
      "#40d6c8",
    );
    path(
      [
        [12, 6],
        [24, 9],
        [18, 19],
        [4, 19],
      ],
      "#c4fff7",
    );
    path(
      [
        [18, 19],
        [30, 19],
        [24, 44],
      ],
      "#84f5df",
    );
    path(
      [
        [24, 9],
        [35, 6],
        [44, 19],
        [30, 19],
      ],
      "#22a89f",
    );
  } else if (id === 109 || id === 124) {
    path(
      [
        [17, 5],
        [34, 9],
        [41, 22],
        [35, 38],
        [16, 43],
        [6, 31],
        [9, 13],
      ],
      id === 109 ? "#353c45" : "#82878c",
    );
    path(
      [
        [17, 5],
        [30, 11],
        [25, 26],
        [9, 29],
        [9, 13],
      ],
      id === 109 ? "#68717b" : "#c5c9cc",
    );
    path(
      [
        [25, 26],
        [35, 20],
        [35, 38],
        [16, 43],
      ],
      "#222b3655",
    );
  } else if (id === 112 || id === 113) {
    c.save();
    c.translate(24, 24);
    c.rotate(0.65);
    c.translate(-24, -24);
    rect(22, 5, 5, 39, "#72502f");
    rect(23, 6, 2, 35, "#c29a5f");
    if (id === 113) {
      path(
        [
          [24, 1],
          [31, 12],
          [18, 12],
        ],
        "#d2dede",
      );
      rect(17, 32, 6, 9, "#ede9d0");
      rect(27, 30, 5, 10, "#cabf9b");
    }
    c.restore();
  } else if (id === 114 || id === 115) {
    path(
      [
        [6, 14],
        [42, 14],
        [36, 42],
        [12, 42],
      ],
      "#abbcc2",
    );
    path(
      [
        [6, 14],
        [12, 20],
        [16, 39],
        [12, 42],
      ],
      "#e8f0eb",
    );
    c.strokeStyle = "#c1d1d8";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(24, 17, 13, Math.PI, 0);
    c.stroke();
    path(
      [
        [10, 14],
        [38, 14],
        [34, 22],
        [14, 22],
      ],
      id === 115 ? "#409cde" : "#495b64",
    );
    if (id === 115) rect(15, 15, 13, 3, "#a2eaff");
  } else if (id === 116) {
    for (const [x, y] of [
      [14, 13],
      [29, 7],
      [21, 24],
      [34, 29],
      [9, 34],
    ])
      path(
        [
          [x, y],
          [x + 6, y + 2],
          [x + 8, y + 7],
          [x + 3, y + 10],
          [x - 2, y + 5],
        ],
        "#9abc58",
      );
  } else if (id === 117) {
    rect(22, 7, 4, 37, "#a68a42");
    for (let y = 7; y < 33; y += 8) {
      path(
        [
          [23, y + 8],
          [11, y + 1],
          [12, y + 9],
          [23, y + 15],
        ],
        "#dbc477",
      );
      path(
        [
          [25, y + 8],
          [37, y + 1],
          [36, y + 9],
          [25, y + 15],
        ],
        "#f1d586",
      );
    }
  } else if (id === 119) {
    path(
      [
        [24, 3],
        [38, 11],
        [38, 34],
        [24, 45],
        [10, 34],
        [10, 11],
      ],
      "#687e70",
    );
    path(
      [
        [24, 8],
        [33, 15],
        [33, 30],
        [24, 37],
        [15, 30],
        [15, 15],
      ],
      "#c7d899",
    );
    rect(22, 15, 5, 18, "#528f9a");
    rect(18, 20, 13, 5, "#80dcca");
  } else if (id === 121 || id === 122) {
    path(
      [
        [12, 6],
        [19, 6],
        [21, 14],
        [28, 14],
        [30, 6],
        [36, 6],
        [45, 18],
        [37, 25],
        [33, 22],
        [34, 43],
        [14, 43],
        [15, 22],
        [11, 25],
        [3, 18],
      ],
      color,
    );
    rect(19, 18, 10, 19, "#ffffff45");
    rect(15, 36, 18, 5, "#27425355");
  } else if (id === 123) {
    path(
      [
        [11, 6],
        [28, 5],
        [34, 13],
        [31, 25],
        [23, 30],
        [13, 27],
        [11, 18],
        [19, 17],
        [18, 23],
        [25, 22],
        [27, 14],
        [21, 11],
        [11, 13],
      ],
      "#b7c6c8",
    );
    path(
      [
        [35, 27],
        [44, 32],
        [37, 43],
        [29, 40],
      ],
      "#646975",
    );
    rect(24, 33, 4, 7, "#ffd77b");
    rect(19, 29, 4, 3, "#ff8f44");
  } else if (id === 126) {
    path(
      [
        [6, 6],
        [42, 6],
        [40, 31],
        [24, 45],
        [8, 31],
      ],
      "#b8c9ce",
    );
    path(
      [
        [11, 10],
        [37, 10],
        [35, 28],
        [24, 38],
        [13, 28],
      ],
      "#785735",
    );
    rect(21, 10, 6, 26, "#a6c2b9");
    rect(12, 19, 24, 5, "#a6c2b9");
  } else {
    path(
      [
        [24, 4],
        [42, 19],
        [34, 40],
        [14, 40],
        [6, 19],
      ],
      color,
    );
  }
  const url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}
export function ItemIcon({ id, size = 36 }: { id: number; size?: number }) {
  if (!id) return null;
  return (
    <img
      src={itemArt(id)}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{ imageRendering: "pixelated", objectFit: "contain" }}
    />
  );
}
