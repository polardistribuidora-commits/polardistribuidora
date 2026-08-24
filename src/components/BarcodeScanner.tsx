import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  onDetected: (codigo: string) => void
}

export function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!open || !videoRef.current) return

    let controls: { stop: () => void } | undefined
    let ativo = true
    const reader = new BrowserMultiFormatReader()

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        videoRef.current,
        (result) => {
          if (!ativo || !result) return
          const texto = result.getText().trim()
          if (texto) {
            ativo = false
            controls?.stop()
            onDetected(texto)
            onClose()
          }
        }
      )
      .then((c) => {
        controls = c
      })
      .catch((e) => {
        console.error(e)
        setErro('Não foi possível acessar a câmera. Verifique a permissão do navegador.')
      })

    return () => {
      ativo = false
      controls?.stop()
    }
  }, [open, onClose, onDetected])

  if (!open) return null

  return (
    <div className="modal-backdrop">
      <div className="scanner-modal card">
        <div className="row-between">
          <div>
            <h2><Camera size={20} /> Ler código de barras</h2>
            <p className="muted">Aponte a câmera para o EAN/GTIN do produto.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">
            <X />
          </button>
        </div>
        <video ref={videoRef} className="scanner-video" muted playsInline />
        {erro && <div className="alert error">{erro}</div>}
      </div>
    </div>
  )
}
