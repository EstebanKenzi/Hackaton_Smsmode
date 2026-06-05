import { useState, useEffect } from 'react'


function App() {
  const [slots, setSlots] = useState<any[]>([])
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/slots.json')
      .then(res => res.json())
      .then(data => setSlots(data))
      .catch(err => console.error('Erreur:', err))
  }, [])

  const availableSlots = slots.filter(s => !s.booked)
  const bookedSlots = slots.filter(s => s.booked)

  const sendRCS = async () => {

  }


  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '1rem' }}>
      {/* premiere section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>       
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <p style={{ fontSize: '18px', fontWeight: '500', margin: 0 }}>Rappels RCS</p>
            <p style={{ fontSize: '13px', color: 'gray', margin: 0 }}>Cabinet Médical </p>
          </div>
        </div>
      </div>

      {/* deuxieme section */}
      <div style={{ background: 'white', border: '0.5px solid #e5e5e5', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
        
        <p style={{ fontSize: '15px', fontWeight: '500', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Inviter un patient à réserver
        </p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
          <input
            type="text"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="336XXXXXXXX"
            style={{ flex: 1, height: '40px', padding: '0 12px', border: '0.5px solid #e5e5e5', borderRadius: '8px', fontSize: '14px' }}
          />
          <button
            onClick={sendRCS}
            style={{ background: '#185FA5', color: 'white', border: 'none', borderRadius: '8px', padding: '0 20px', height: '40px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
          >
            Envoyer le rappel RCS
          </button>
          {message && <p style={{ color: 'green', marginTop: '8px', fontSize: '13px' }}> {message}</p>}
        </div>

      </div>

      {/* troisieme section */}
      <div style={{ background: 'white', border: '0.5px solid #e5e5e5', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <p style={{ fontSize: '15px', fontWeight: '500', margin: 0 }}>
             Créneaux disponibles <span style={{ background: '#f0f0f0', color: 'gray', fontSize: '12px', padding: '2px 8px', borderRadius: '20px' }}>{availableSlots.length}</span>
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          
            {availableSlots.map(slot => (
              <div key={slot.id} style={{ border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: '500', margin: 0 }}>{slot.label}</p>
                </div>
                <span style={{ background: '#EAF3DE', color: '#3B6D11', fontSize: '12px', padding: '3px 10px', borderRadius: '20px' }}>Libre</span>
              </div>
            ))}
        </div>
      </div>

      {/* quatrieme section */}
      <div style={{ background: 'white', border: '0.5px solid #e5e5e5', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <p style={{ fontSize: '15px', fontWeight: '500', margin: 0 }}>
            Créneaux réservés <span style={{ background: '#f0f0f0', color: 'gray', fontSize: '12px', padding: '2px 8px', borderRadius: '20px' }}>{bookedSlots.length}</span>
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {bookedSlots.map(slot => (
            <div key={slot.id} style={{ border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', fontWeight: '500', margin: 0 }}>{slot.label}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '13px', fontWeight: '500', margin: 0 }}>{slot.bookedBy}</p>
              </div>
            </div>
          ))}
        </div>

      </div>

    </div>
  )
}

export default App