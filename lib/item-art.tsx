import { BLOCKS, item } from "./blocks";
import { hash } from "./world";
const cache = new Map<number, string>();
export function itemArt(id: number): string {
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
  if (id > 0 && id < BLOCKS.length) {
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
    if ([20, 21, 22, 23, 80].includes(id)) {
      const ore = (
        { 20: "#181b21", 21: "#d9c0a4", 22: "#60ffe1", 23: "#eed365", 80: "#f09c63" } as Record<
          number,
          string
        >
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
    if (id === 61) {
      rect(4, 21, 20, 4, "#312518");
      rect(20, 24, 6, 10, "#e9ce7a");
      rect(22, 27, 2, 4, "#695123");
    }
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
  } else if ([101, 102, 103, 104, 108, 118, 127, 128, 129, 130].includes(id)) {
    c.save();
    c.translate(24, 24);
    c.rotate(Math.PI / 4);
    c.translate(-24, -24);
    rect(21, 18, 7, 27, "#38291c");
    rect(22, 18, 4, 26, "#a47b45");
    rect(23, 21, 2, 20, "#c89b58");
    if ([101, 102, 103].includes(id)) {
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
    } else if ([104, 108, 129].includes(id)) {
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
    } else if ([127, 128].includes(id)) {
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
    } else if (id === 130)
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
  } else if ([110, 120].includes(id)) {
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
