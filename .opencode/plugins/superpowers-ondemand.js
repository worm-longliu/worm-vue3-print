/**
 * Superpowers On-Demand Plugin
 *
 * Registers the superpowers skills directory so skills are discoverable,
 * but does NOT inject the bootstrap prompt. Skills only activate when
 * the user explicitly invokes them via the `skill` tool.
 */

import path from 'path';
import os from 'os';

const superpowersSkillsDir = path.join(
  os.homedir(),
  '.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills'
);

export default async () => {
  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(superpowersSkillsDir)) {
        config.skills.paths.push(superpowersSkillsDir);
      }
    },
  };
};
