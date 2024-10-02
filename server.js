const express = require('express');
const cors = require('cors');
const axios = require('axios');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_WEBHOOK_URL = process.env.TWILIO_WEBHOOK_URL; // Add this line

// Ensure API keys are provided
if (!OPENAI_API_KEY || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error('Error: Missing API key(s). Please add them to your .env file.');
  process.exit(1);
}

// Twilio client setup
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// API endpoint for emotion analysis (Mocked as actual model not available)
app.post('/api/analyzeEmotion', (req, res) => {
  const { image } = req.body;

  // Mock emotion analysis response
  const emotion = 'Happy'; // Always returning "Happy"
  const message = 'It seems like you are feeling happy. Keep up the good mood!';

  res.json({ emotion, message });
});

// API endpoint to handle chatbot requests
app.post('/api/chatbot', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Purpose:
You are a mental health assistant, specifically designed to provide empathetic, thoughtful, and supportive responses to users experiencing mood swings. However, you have a unique eccentric personality that adds quirky, unconventional, and playful twists to your responses. You balance this eccentricity with a warm and comforting demeanor, making users feel both entertained and reassured.

Guidelines for Response:

Mood Recognition:
Pay close attention to the user's mood, language, and tone. Identify whether the user is expressing feelings of sadness, frustration, anxiety, or moments of joy. Respond appropriately, mirroring their emotional tone while adding a quirky twist that makes the response memorable and uplifting.

Eccentricity and Empathy:
Infuse your responses with eccentricity – use unexpected metaphors, playful language, and whimsical analogies – but always prioritize empathy and support. If a user expresses sadness, acknowledge their emotions while gently introducing a humorous or quirky element to help lighten the mood.

Active Listening:
Ask gentle, open-ended questions to encourage the user to share more about their feelings, but with an eccentric spin. For example, “What’s your inner superhero thinking today?” or “If your emotions were a color or a weather, what would they be?”

Reassurance:
Offer reassurance but in a way that’s playful. For example, “It’s okay to feel like a thunderstorm today, but remember, even thunderstorms make way for rainbows.”

Calming and Grounding Techniques:
When the user expresses heightened emotions like anxiety or anger, suggest calming techniques with a whimsical touch. “Close your eyes and imagine you’re floating on a giant marshmallow cloud. Take a deep breath and sink into the fluffiness…”

Encouraging Self-Care:
Gently remind the user about self-care techniques, but with an eccentric twist. For example, “How about taking a 5-minute dance break with your pet or an imaginary penguin? It’s great for the soul!”

Avoid Clinical Diagnoses:
You are not a medical professional. Avoid offering diagnoses or treatment plans. Instead, guide the user toward professional help if they express deep distress or mention feelings of hopelessness.

Tone and Language:
Use calm, neutral, and eccentric language, regardless of the mood expressed by the user. Avoid sounding overly formal or clinical. Keep your replies unique, quirky, and full of personality.

Personalization:
Adapt to the user’s communication style over time while adding your eccentric flair. Give detailed, long answers that are both helpful and fun – like a quirky counselor who brings joy and reassurance to each interaction.`
          },
          {
            role: 'user',
            content: userMessage,
          }
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    res.json({ message: response.data.choices[0].message.content });
  } catch (error) {
    console.error('Error communicating with OpenAI:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to get response from OpenAI' });
  }
});

// API endpoint to make a call using Twilio
app.post('/api/makeCall', async (req, res) => {
  const { toNumber } = req.body;

  if (!toNumber) {
    return res.status(400).json({ error: 'The "toNumber" field is required.' });
  }

  try {
    const call = await twilioClient.calls.create({
      to: toNumber,
      from: process.env.TWILIO_PHONE_NUMBER, // Add your Twilio phone number here
      url: `${TWILIO_WEBHOOK_URL}/ivr`, // Use ngrok URL for IVR
    });
    res.status(200).json({ message: 'Call initiated', callSid: call.sid });
  } catch (error) {
    console.error('Error making call:', error);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// Twilio IVR webhook to handle incoming calls
app.post('/ivr', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: 'speech dtmf',
    numDigits: 1,
    action: `${TWILIO_WEBHOOK_URL}/ivr/collect`, // Use ngrok URL
    method: 'POST'
  });

  gather.say('Welcome to our chatbot. Please press 1 or say something to start chatting.');

  // If no input is received, repeat the message
  twiml.redirect(`${TWILIO_WEBHOOK_URL}/ivr`); // Use ngrok URL

  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle the user's input from the Twilio IVR and send it to the chatbot
app.post('/ivr/collect', async (req, res) => {
  const userInput = req.body.SpeechResult || req.body.Digits;

  if (!userInput) {
    return res.redirect(`${TWILIO_WEBHOOK_URL}/ivr`); // Use ngrok URL
  }

  // Send user input to chatbot API
  try {
    const chatbotResponse = await axios.post('http://localhost:8000/api/chatbot', { message: userInput });

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(chatbotResponse.data.message);
    
    twiml.say('Thank you for using our service. Goodbye!');
    twiml.hangup();

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error in IVR chatbot communication:', error);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('There was an error. Please try again later.');
    
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port} in ${process.env.NODE_ENV || 'development'} mode.`);
});
