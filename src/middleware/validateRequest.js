export function validateRequest(schema) {
  return function requestValidator(req, res, next) {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const error = new Error('Request validation failed');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      error.fields = result.error.flatten().fieldErrors;
      return next(error);
    }

    req.validatedBody = result.data;
    return next();
  };
}
