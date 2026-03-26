import { useState } from 'react';

export default function Home() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('http://localhost:8000/api/generate-response/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    });
    const data = await res.json();
    setResponse(data.response);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>AI Agent Interaction</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter your input"
          style={{ marginRight: '1rem' }}
        />
        <button type="submit">Submit</button>
      </form>
      {response && (
        <div style={{ marginTop: '1rem' }}>
          <strong>Response:</strong> {response}
        </div>
      )}
    </div>
  );
}