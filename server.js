const express = require('express');
const cors = require('cors');
const axios = require('axios');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_WEBHOOK_URL = process.env.TWILIO_WEBHOOK_URL; // Add this line

// Ensure API keys are provided
if (!GEMINI_API_KEY || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
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

app.post('/api/chatbot', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: userMessage,
              },
            ],
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Gemini API full response:', response.data);

    // Extracting message content from candidates
    const candidate = response.data?.candidates?.[0];

    if (!candidate) {
      console.error('No candidates found in the response:', response.data);
      return res.status(500).json({ error: 'No candidates found in Gemini API response.' });
    }

    // Check if the 'content' field is an object and extract text
    let messageContent = '';

    if (typeof candidate.content === 'object' && candidate.content.parts) {
      messageContent = candidate.content.parts.map(part => part.text).join(' ');
    } else {
      messageContent = candidate.content;  // If it's a plain string
    }

    if (!messageContent) {
      console.error('Unexpected response structure:', response.data);
      return res.status(500).json({ error: 'Unexpected response structure from Gemini API.' });
    }

    // Send the extracted message content as the response
    res.json({ message: messageContent });
  } catch (error) {
    console.error('Error communicating with Gemini API:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to get response from Gemini API' });
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
