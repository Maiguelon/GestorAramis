import { useState } from 'react';
import type { Client } from '../../contracts/domain';
import { validClientLogo } from '../../contracts/client-logo';
import './client-avatar.css';
const examples:Record<string,{name:string;url:string}>={
 'client-oliva':{name:'Aura',url:'/brand/clients/aura.svg'},
 'client-norte':{name:'Beecomex',url:'/brand/clients/beecomex.svg'},
 'client-bruma':{name:'Musas',url:'/brand/clients/musas.svg'},
};
/** Reference logos for the three fictional demo clients, never changes client data. */
export default function ClientAvatar({client,large=false}:{client:Pick<Client,'id'|'name'|'initials'|'color'|'logo'>;large?:boolean}){
 const example=client.logo === undefined ? examples[client.id] : undefined;
 const url=client.logo && validClientLogo(client.logo) ? client.logo : example?.url;
 const [failed,setFailed]=useState<string|null>(null);
 const visible=!!url && failed!==url;
 const label=example?`Logo de muestra: ${example.name}`:`Logo de ${client.name}`;
 return <span className={`client-avatar ${large?'large':''} ${visible?'with-logo':''}`} style={{background:visible?'#fff':`${client.color}15`,color:client.color}} title={visible?label:client.name}>{visible?<img src={url} alt={label} onError={()=>setFailed(url)}/>:client.initials}</span>;
}
