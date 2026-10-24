import type { Piece } from '../../contracts/domain';
import './client-review-badge.css';
export default function ClientReviewBadge({piece,design=false}:{piece:Piece;design?:boolean}){
 const r=piece.clientReview;
 if(!r||(design&&(r.kind!=='delivery'||r.contentStatus!=='changes')))return null;
 const state=design?'changes':r.status;
 const detail=[r.contentStatus?`${r.kind==='script'?'Guion':'Entrega'}: ${{pending:'pendiente',approved:'aprobado',changes:'cambios pedidos'}[r.contentStatus]}`:'',r.captionStatus&&!design?`Caption: ${{pending:'pendiente',approved:'aprobado',changes:'cambios pedidos'}[r.captionStatus]}`:''].filter(Boolean).join(' · ');
 return <span className={`client-review-badge ${state}`} title={detail}>Cliente · {{pending:'Revisión pendiente',approved:'Aprobado',changes:'Cambios pedidos'}[state]}</span>;
}
