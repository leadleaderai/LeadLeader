let limiterByKey = () => (req,res,next)=>next();
try {
  const abuse = require('../abuse');
  if (abuse && typeof abuse.limiterByKey === 'function') limiterByKey = abuse.limiterByKey;
} catch {}
module.exports = { limiterByKey };
