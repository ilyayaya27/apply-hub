import { readFileSync, existsSync } from 'node:fs';
import { loadProfile, getMarketAssets } from './profile.js';

export const loadCoverLetter = (root) => {
  const { cover_letter_path: path, market } = getMarketAssets(loadProfile(root));
  if (!existsSync(path)) {
    throw new Error(`Cover letter not found for market=${market}: ${path}`);
  }
  return readFileSync(path, 'utf8').trim();
};
