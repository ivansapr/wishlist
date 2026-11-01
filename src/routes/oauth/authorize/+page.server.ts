import type { RequestEvent } from '@sveltejs/kit';
import { authorizationPage,authorize } from '#lib/server/oauth';
export const load=(event:RequestEvent)=>authorizationPage(event);
export const actions={default:authorize};
