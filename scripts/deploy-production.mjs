import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
const branch = "codex/deploy-vercel-supabase";
const run = (args, options={}) => {
  const result=spawnSync(args[0],args.slice(1),{encoding:"utf8",...options});
  if(result.status!==0) throw new Error(result.stderr||result.stdout||`${args[0]} failed`);
  return result.stdout.trim();
};
if(run(["git","branch","--show-current"])!==branch) throw new Error(`Production deployment requires ${branch}.`);
if(run(["git","status","--porcelain"])) throw new Error("Commit reviewed changes before deploying.");
const commit=run(["git","rev-parse","HEAD"]);
const remote=run(["git","ls-remote","origin",`refs/heads/${branch}`]).split(/\s/)[0];
if(remote!==commit) throw new Error("Push this exact commit to the deployment branch first.");
const link=JSON.parse(readFileSync(".vercel/project.json","utf8"));
if(link.projectName!=="siklab-tally-free" || link.orgId!=="team_43lYGkki2yAy7sOdaxTqHgzb") throw new Error("Unexpected Vercel project or account.");
const result=spawnSync("npx",["--yes","vercel@66.6.0","deploy","--prod","--yes","--scope","execuus-projects","--meta",`siklabCommit=${commit}`,"--meta",`siklabBranch=${branch}`],{stdio:"inherit"});
process.exitCode=result.status||0;
