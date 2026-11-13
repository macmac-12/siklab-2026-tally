export async function api<T=Record<string,unknown>>(path:string,body?:unknown,key?:string):Promise<T> {
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),cache:'no-store'});
 const data=await response.json();
 if(!response.ok){if(response.status===401&&path!=='/api/auth/login')location.assign('/staff/login');throw new Error(data.error||'The request could not be completed.');}
 return data as T;
}
export type Run=(body:unknown)=>Promise<boolean>;
