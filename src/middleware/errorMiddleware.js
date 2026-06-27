// Converts thrown errors into stable API responses.
const errorMiddleware = (err, req, res, next) => {
  console.error(err);
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    message: err.message || 'Server Error'
  });
};

module.exports = errorMiddleware;
