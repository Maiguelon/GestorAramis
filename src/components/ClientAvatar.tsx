import { useState } from 'react';
import type { Client } from '../../contracts/domain';
import './client-avatar.css';
const examples:Record<string,{name:string;url:string}>={
 'client-oliva':{name:'Aura',url:'/brand/clients/aura.svg'},
 'client-norte':{name:'Beecomex',url:'/brand/clients/beecomex.svg'},
 'client-bruma':{name:'Musas',url:'/brand/clients/musas.svg'},
};
/** Reference logos for the three fictional demo clients, never changes client data. */
export default function ClientAvatar({client,large=false}:{client:Pick<Client,'id'|'name'|'initials'|'color'>;large?:boolean}){
 const logo=examples[client.id];const [failed,setFailed]=useState(false);
 return <span className={`client-avatar ${large?'large':''} ${logo&&!failed?'with-logo':''}`} style={{background:logo&&!failed?'#fff':`${client.color}15`,color:client.color}} title={logo?`Logo de muestra: ${logo.name}`:client.name}>{logo&&!failed?<img src={logo.url} alt={`Logo de muestra: ${logo.name}`} onError={()=>setFailed(true)}/>:client.initials}</span>;
}
