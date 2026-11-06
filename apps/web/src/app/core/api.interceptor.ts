import type { HttpInterceptorFn } from '@angular/common/http';

/** Marks every API call as coming from our SPA (the worker's CSRF guard requires it on mutations). */
export const apiInterceptor: HttpInterceptorFn = (req, next) =>
  req.url.startsWith('/api/') ? next(req.clone({ setHeaders: { 'X-Requested-With': 'kebabarium' }, withCredentials: true })) : next(req);
