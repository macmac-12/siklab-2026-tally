import { Suspense } from 'react';
import PublicApp from '@/components/public/PublicApp';
export default function Page(){return <Suspense fallback={<p>Loading Siklab 2026…</p>}><PublicApp view="results"/></Suspense>;}
