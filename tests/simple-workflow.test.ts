import { describe, expect, it } from 'vitest';
import type { Command, CommandContext } from '../contracts/domain';
import { applyCommand } from '../src/domain/engine';
import { createSeed } from '../src/domain/seed';

const now = '2026-10-13T20:00:00.000Z';
const context = (actor = 'member-lucia'): CommandContext => ({actor,now,newId:()=>crypto.randomUUID(),token:()=>crypto.randomUUID()});

describe('simplified planning, production and accidental approval correction', () => {
  it('assigns Design on entering production and Marketing on returning to planning', () => {
    const initial = createSeed('2026-10-13');
    const p = initial.pieces.find(piece => piece.status === 'planned')!;
    const producing = applyCommand(initial,{type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch:{status:'production'}},context()).state;
    const ready = producing.pieces.find(piece => piece.id === p.id)!;
    expect(ready).toMatchObject({status:'production',workArea:'design',productionStage:'ready',script:p.script,caption:p.caption});
    const returned = applyCommand(producing,{type:'update-piece',pieceId:p.id,expectedRevision:ready.revision,patch:{status:'planned'}},context()).state;
    expect(returned.pieces.find(piece => piece.id === p.id)).toMatchObject({status:'planned',workArea:'marketing',productionStage:'ready'});
    const legacy = applyCommand(producing,{type:'update-piece',pieceId:p.id,expectedRevision:ready.revision,patch:{productionStage:'recording'}},context()).state;
    expect(legacy.pieces.find(piece => piece.id === p.id)).toMatchObject({status:'planned',workArea:'marketing',productionStage:'ready'});
  });

  it('reopens the same approved snapshot, retaining text, assets and earlier decisions', () => {
    const initial = createSeed('2026-10-13');
    const p = initial.pieces.find(piece => piece.id === 'piece-oliva-approved')!;
    const approval = initial.reviews.find(review => review.pieceId === p.id)!;
    initial.responses.push({id:'earlier-approval',reviewId:approval.id,kind:'approved',comment:'OK original',authorName:'Eric',source:'whatsapp',recordedBy:'member-eric',createdAt:now});
    const original = structuredClone(initial);
    const result = applyCommand(initial,{type:'undo-approval',pieceId:p.id,expectedRevision:p.revision,approvalId:approval.id},context()).state;
    expect(result.pieces.find(piece => piece.id === p.id)).toMatchObject({status:'review',workArea:'marketing',revision:p.revision+1,caption:p.caption});
    expect(result.reviews.find(review => review.id === approval.id)).toEqual({...approval,status:'pending'});
    expect(result.responses).toEqual(initial.responses);
    expect(result.activities.at(-1)).toMatchObject({text:'Aprobación de v1 deshecha por el equipo; vuelve a revisión.',visibility:'internal'});
    expect(initial).toEqual(original);
  });

  it('rejects stale, foreign, archived and repeated corrections', () => {
    const initial = createSeed('2026-10-13');
    const p = initial.pieces.find(piece => piece.id === 'piece-oliva-approved')!;
    const approval = initial.reviews.find(review => review.pieceId === p.id)!;
    const command: Command = {type:'undo-approval',pieceId:p.id,expectedRevision:p.revision,approvalId:approval.id};
    expect(()=>applyCommand(initial,{...command,expectedRevision:p.revision-1},context())).toThrowError(expect.objectContaining({code:'CONFLICT'}));
    expect(()=>applyCommand(initial,{...command,approvalId:'other-review'},context())).toThrowError(expect.objectContaining({code:'CONFLICT'}));
    expect(()=>applyCommand(initial,command,context('outsider'))).toThrowError(expect.objectContaining({code:'FORBIDDEN'}));
    const undone = applyCommand(initial,command,context()).state;
    expect(()=>applyCommand(undone,{...command,expectedRevision:p.revision+1},context())).toThrowError(expect.objectContaining({code:'INVALID_TRANSITION'}));
    p.archived=true;
    expect(()=>applyCommand(initial,command,context())).toThrowError(expect.objectContaining({code:'ARCHIVED'}));
  });
});
