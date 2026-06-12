import multer from 'multer';

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Solo se permiten imágenes'), false);
};

const memStorage = multer.memoryStorage();

export const uploadFoto = multer({
  storage: memStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

export const uploadComprobante = multer({
  storage: memStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});
