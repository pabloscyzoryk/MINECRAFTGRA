import { createGameServer } from "./gateway";
const { server } = createGameServer({
  local: !process.env.VERCEL,
  file: process.env.VERCEL ? undefined : ".local-world.json",
});
export default server;
