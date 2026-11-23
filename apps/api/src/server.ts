import { app } from "./app.js";
import { config } from "./config.js";

app.listen(config.PORT, () => {
  console.log(`Aires Gestão API disponível na porta ${config.PORT}`);
});
