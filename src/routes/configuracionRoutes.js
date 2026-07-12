import { Router } from 'express';
import {
  getConfiguracion, uploadImagen, getConfiguracionPublica,
  getRedes, createRed, updateRed, reordenarRedes, deleteRed,
  getBanners, createBanner, updateBanner, deleteBanner,
  reordenarBanners, marcarBannerPrincipal, getBannersPublico,
} from '../controllers/configuracionController.js';
import { verificarToken } from '../middlewares/verificarToken.js';
import { uploadFoto } from '../middlewares/upload.js';

const router = Router();

// Públicas — declaradas ANTES de verificarToken: las usan login.html (sin
// sesión) y volcano_web (sin login) para branding y el carrusel de la home.
router.get('/publica',         getConfiguracionPublica);
router.get('/banners/publico', getBannersPublico);

router.use(verificarToken);

router.get('/',                   getConfiguracion);
router.post('/imagen/:clave',     uploadFoto.single('file'), uploadImagen);

router.get('/redes',              getRedes);
router.post('/redes',             createRed);
router.put('/redes/orden',        reordenarRedes);   // ← antes de /:id
router.put('/redes/:id',          updateRed);
router.delete('/redes/:id',       deleteRed);

router.get('/banners',              getBanners);
router.post('/banners',             uploadFoto.single('file'), createBanner);
router.put('/banners/orden',        reordenarBanners);   // ← antes de /:id
router.put('/banners/:id/principal', marcarBannerPrincipal);
router.put('/banners/:id',          uploadFoto.single('file'), updateBanner);
router.delete('/banners/:id',       deleteBanner);

export default router;
