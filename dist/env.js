// Carrega as variáveis do arquivo .env (se existir) antes dos demais módulos
import fs from "fs";
if (fs.existsSync(".env"))
    process.loadEnvFile(".env");
