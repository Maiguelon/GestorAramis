import type { Asset, Piece, WorkspaceState } from '../../contracts/domain';
import { addDays, localDate } from './selectors';

const demoAsset = (id: string, name: string, url: string): Asset => ({ id, name, mimeType: 'image/svg+xml', size: 2048, url, source: 'demo' });

/** Fictional demo only. All dates follow the local calendar, never a UTC date conversion. */
export function createSeed(today = localDate()): WorkspaceState {
  const createdAt = `${addDays(today, -5)}T13:00:00.000Z`;
  const now = `${today}T13:00:00.000Z`;
  const base: Pick<Piece, 'ownerId' | 'visibleToClient' | 'caption' | 'internalNote' | 'archived' | 'revision' | 'createdAt' | 'updatedAt'> = { ownerId: 'member-lucia', visibleToClient: true, caption: '', internalNote: 'Nota interna de demostración. Nunca debe mostrarse al cliente.', archived: false, revision: 1, createdAt, updatedAt: now };
  const coverOliva = demoAsset('asset-oliva-cover', 'Pieza de muestra · Casa Oliva.svg', '/demo/cover-oliva.svg');
  const coverNorte = demoAsset('asset-norte-cover', 'Pieza de muestra · Estudio Norte.svg', '/demo/cover-norte.svg');
  const coverBruma = demoAsset('asset-bruma-cover', 'Pieza de muestra · Bruma Café.svg', '/demo/cover-bruma.svg');
  const olivaCaption = 'Una pausa, una mesa compartida y ese rincón que se siente como casa. Conocé nuestra nueva colección.\n\nContenido ficticio para probar la aprobación.';
  return {
    schemaVersion: 1,
    clients: [
      { id: 'client-oliva', name: 'Casa Oliva', initials: 'CO', color: '#8b2634', contactName: 'Contacto ficticio · Olivia', phone: '' },
      { id: 'client-norte', name: 'Estudio Norte', initials: 'EN', color: '#5c9cd9', contactName: 'Contacto ficticio · Nicolás', phone: '' },
      { id: 'client-bruma', name: 'Bruma Café', initials: 'BC', color: '#f4b943', contactName: 'Contacto ficticio · Bruno', phone: '' },
    ],
    members: [{ id: 'member-lucia', name: 'Lucía · demo', initials: 'L' }, { id: 'member-mateo', name: 'Mateo · demo', initials: 'M' }],
    pieces: [
      { ...base, id: 'piece-oliva-material', clientId: 'client-oliva', title: 'Así se vive Casa Oliva', format: 'reel', status: 'production', plannedDate: addDays(today, 1), internalNote: 'Necesitamos tomas del espacio y una presentación. Nota privada ficticia.' },
      { ...base, id: 'piece-oliva-review', clientId: 'client-oliva', title: 'Tu rincón favorito', format: 'carousel', status: 'review', plannedDate: addDays(today, 2), caption: olivaCaption },
      { ...base, id: 'piece-oliva-approved', clientId: 'client-oliva', title: 'Ideas para compartir', format: 'post', status: 'approved', plannedDate: addDays(today, 3), caption: 'Pequeños detalles para disfrutar juntos. Contenido ficticio.' },
      { ...base, id: 'piece-norte-production', clientId: 'client-norte', title: 'Detrás de cada proyecto', format: 'reel', status: 'production', ownerId: 'member-mateo', plannedDate: addDays(today, 4), caption: 'Borrador interno que aún no está listo para compartir.' },
      { ...base, id: 'piece-norte-overdue', clientId: 'client-norte', title: 'Tres preguntas antes de empezar', format: 'carousel', status: 'review', plannedDate: addDays(today, -1), caption: 'Cada proyecto empieza por escuchar. Contenido de demostración.' },
      { ...base, id: 'piece-bruma-published', clientId: 'client-bruma', title: 'El ritual de la mañana', format: 'post', status: 'published', plannedDate: addDays(today, -2), caption: 'Tu pausa favorita comienza acá. Contenido ficticio.' },
      { ...base, id: 'piece-bruma-idea', clientId: 'client-bruma', title: 'Conocé a quienes preparan tu café', format: 'story', status: 'planned', visibleToClient: false, ownerId: 'member-mateo', plannedDate: null, caption: 'Idea privada en preparación.' },
    ],
    reviews: [
      { id: 'review-oliva-1', pieceId: 'piece-oliva-review', version: 1, caption: olivaCaption, assets: [coverOliva], status: 'pending', createdAt, sentAt: createdAt },
      { id: 'review-oliva-approved', pieceId: 'piece-oliva-approved', version: 1, caption: 'Pequeños detalles para disfrutar juntos. Contenido ficticio.', assets: [structuredClone(coverOliva)], status: 'approved', createdAt, sentAt: createdAt },
      { id: 'review-norte-1', pieceId: 'piece-norte-overdue', version: 1, caption: 'Cada proyecto empieza por escuchar. Contenido de demostración.', assets: [coverNorte], status: 'pending', createdAt, sentAt: createdAt },
      { id: 'review-bruma-1', pieceId: 'piece-bruma-published', version: 1, caption: 'Tu pausa favorita comienza acá. Contenido ficticio.', assets: [coverBruma], status: 'approved', createdAt, sentAt: createdAt },
    ],
    materials: [{ id: 'material-oliva-1', pieceId: 'piece-oliva-material', instructions: 'Necesitamos 3 tomas verticales del espacio y un video de presentación de aproximadamente 30 segundos. Podés enviarlos juntos. Este pedido es ficticio: la demo no sube archivos a Drive.', dueDate: addDays(today, -1), status: 'pending', assets: [], createdAt, sentAt: createdAt }],
    responses: [
      { id: 'response-seed-oliva', reviewId: 'review-oliva-approved', kind: 'approved', comment: '¡Está listo!', authorName: 'Olivia · demo', source: 'link', recordedBy: null, createdAt: now },
      { id: 'response-seed-bruma', reviewId: 'review-bruma-1', kind: 'approved', comment: '', authorName: 'Bruno · demo', source: 'whatsapp', recordedBy: 'member-lucia', createdAt: now },
    ],
    shares: [
      { id: 'share-calendar-oliva', token: 'demo-calendar', scope: 'calendar', targetId: 'client-oliva', clientId: 'client-oliva', revokedAt: null, createdAt },
      { id: 'share-review-oliva', token: 'demo-review', scope: 'review', targetId: 'review-oliva-1', clientId: 'client-oliva', revokedAt: null, createdAt },
      { id: 'share-material-oliva', token: 'demo-material', scope: 'material', targetId: 'material-oliva-1', clientId: 'client-oliva', revokedAt: null, createdAt },
    ],
    activities: [
      { id: 'activity-oliva-material', pieceId: 'piece-oliva-material', text: 'Pedido de material preparado.', actor: 'Lucía · demo', createdAt, visibility: 'client' },
      { id: 'activity-oliva-private', pieceId: 'piece-oliva-review', text: 'Nota privada: ajustar la planificación con el equipo.', actor: 'Lucía · demo', createdAt, visibility: 'internal' },
      { id: 'activity-oliva-review', pieceId: 'piece-oliva-review', text: 'Versión 1 enviada para revisión.', actor: 'Lucía · demo', createdAt, visibility: 'client' },
      { id: 'activity-oliva-approved', pieceId: 'piece-oliva-approved', text: 'Versión 1 aprobada.', actor: 'Olivia · demo', createdAt: now, visibility: 'client' },
    ],
  };
}
