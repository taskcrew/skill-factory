import { Server } from "socket.io";
import { Server as Engine } from "@socket.io/bun-engine";

const engine = new Engine();
const io = new Server();
io.bind(engine);

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("disconnect", (reason) => {
    console.log(`Client disconnected: ${socket.id} (${reason})`);
  });
});

export { io, engine };
