// Sends a consistent JSON success response.
const sendSuccess = (res, statusCode, payload) => {
  return res.status(statusCode).json(payload);
};

// Sends a consistent JSON error response.
const sendError = (res, statusCode, message, details) => {
  const body = { message };
  if (details) body.error = details;
  return res.status(statusCode).json(body);
};

module.exports = { sendSuccess, sendError };
