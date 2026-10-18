import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve the backend .env beside src/ or dist/, independent of the shell's cwd.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
