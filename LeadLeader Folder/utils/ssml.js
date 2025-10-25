function addNaturalPacing(text) {
  // Basic SSML wrapper to make speech sound less robotic.
  return `<speak><break time="0.3s"/>${text}<break time="0.5s"/></speak>`;
}

module.exports = { addNaturalPacing };
