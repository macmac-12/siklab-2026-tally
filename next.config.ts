import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import type { NextConfig } from 'next';
export default (phase:string):NextConfig=>({
 distDir:phase===PHASE_DEVELOPMENT_SERVER?'.next-dev':'.next',
 async headers(){return [{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Frame-Options',value:'DENY'}]}];},
});
