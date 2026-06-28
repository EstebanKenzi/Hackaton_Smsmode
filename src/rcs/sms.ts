export async function sendSMS(to: string, text: string, apiKey: string) {
  const response = await fetch('https://rest.smsmode.com/sms/v1/messages', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      recipient: { to: to },
      body: { text: text }
    })
  });

  const data = await response.json();
  console.log('SMS envoyé ✅', data);
  return data;
}