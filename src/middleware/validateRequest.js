export function validateRequest(schema, message = 'Request validation failed') {
  return function requestValidator(req, res, next) {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const error = new Error(message);
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      error.fields = result.error.flatten().fieldErrors;
      return next(error);
    }

    req.validatedBody = result.data;
    return next();
  };
}
