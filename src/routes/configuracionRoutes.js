import { Router } from 'express';
import {
  getConfiguracion, uploadImagen,
  getRedes, createRed, updateRed, reordenarRedes, deleteRed,
  getBanners, createBanner, updateBanner, deleteBanner,
  reordenarBanners, marcarBannerPrincipal,
} from '../controllers/configuracionController.js';
import { verificarToken } from '../middlewares/verificarToken.js';
import { uploadFoto } from '../middlewares/upload.js';

const router = Router();
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
