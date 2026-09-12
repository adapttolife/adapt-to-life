// Existing intake Worker, narrowed to its actual job. No forms, assets or duplicate gift/Drive jobs.
import {sweepIntake} from './intake.js';
export default {
  fetch(){return new Response('Not found',{status:404})},
  async scheduled(event,env,ctx){ctx.waitUntil(sweepIntake(env))}
};
