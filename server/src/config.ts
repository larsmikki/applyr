import path from 'path';
import os from 'os';

export const config = {
  port: parseInt(process.env.PORT || '3091'),
  dataDir: process.env.DATA_DIR || (process.env.NODE_ENV !== 'production'
    ? path.join(process.cwd(), 'data')
    : path.join(os.homedir(), '.applyr', 'data')),
  outputDir: process.env.OUTPUT_DIR || path.join(os.homedir(), 'Documents', 'Applyr'),
  clientDistDir: path.join(process.cwd(), '..', 'client', 'dist'),
};
