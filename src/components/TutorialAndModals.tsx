import React, { useState } from 'react';
import { MissionPhase, SurvivorBeacon } from '../types/wts';
import {
  CheckCircle2,
  Clock,
  Cpu,
  Flame,
  Gamepad2,
  HelpCircle,
  Image as ImageIcon,
  Radio,
  RotateCcw,
  X,
} from 'lucide-react';

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
}

const TUTORIAL_STEPS = [
  {
    title: '1. ¿Qué es el Sistema WTS?',
    icon: Cpu,
    body: ' tras un terremoto, las redes celulares y eléctricas suelen caer. El arnés pectoral WTS mide localmente pulso, SpO₂, temperatura y movimiento, ejecuta IA embebida (TinyML) y emite tramas ligeras por radio Sub-GHz de 433 MHz sin necesitar internet ni exigir LoRa.',
    highlight:
      'Objetivo: rescatar a los 4 portadores del chaleco antes de que se agote la ventana de 6 minutos, priorizando alertas y cuidando la batería.',
  },
  {
    title: '2. Modo Persona con el Chaleco (WTS 014)',
    icon: Flame,
    body: 'Comienzas sintiendo la emergencia desde el arnés WTS 014. Puedes moverte (WASD / botones), quedarte inmóvil o dar 3+ golpes rítmicos seguidos (Espacio, botón o clic en el chaleco) para que el IMU + TinyML activen la alerta "Posible SOS".',
    highlight:
      'Si baja la temperatura (evento de frío/hipotermia), verás encenderse por pulsos (PWM) la capa térmica serpentina del pecho: abriga gradualmente pero consume más batería.',
  },
  {
    title: '3. Modo Rescatista y Búsqueda RSSI (No es GPS)',
    icon: Radio,
    body: 'Cambia al Rescatista para recorrer la zona de escombros con el Receptor 433 MHz. Alterna balizas con ◀ / ▶ y guíate por las barras RSSI y los pulsos sonoros. Los muros de hormigón y vigas de acero atenúan o cortan la señal: si pierdes recepción, la pantalla avisará que el dato está desactualizado.',
    highlight:
      'Nota educativa: los LEDs VERDE, AMARILLO, ROJO y NEGRO son una simulación educativa inspirada en START para organizar la búsqueda; no son un diagnóstico médico real ni deducen fallecimiento.',
  },
  {
    title: '4. Rescate, Inspector 3D y Realidad Mixta (XR)',
    icon: CheckCircle2,
    body: 'Cuando logres 4–5 barras RSSI y te acerques al hueco estructural (<4.5 m), el botón OK brillará para completar el rescate. En cualquier momento abre el Inspector 3D para girar ambos dispositivos y pulsar sus partes, o activa Realidad Mixta (WebXR) si tu dispositivo dispone de AR.',
    highlight:
      'Controles rápidos: WASD / Flechas o joysticks virtuales para moverse · Ratón arrastrar para mirar/girar · Espacio = Golpe SOS · E / Enter = Botón OK. También puedes conectar un mando de PC.',
  },
  {
    title: '5. Jugar en VR con joysticks',
    icon: Gamepad2,
    body: 'Pulsa «Jugar en VR» para entrar en immersive-vr a escala real. El joystick izquierdo camina hacia donde miras, el derecho gira (suave o por pasos de 30°), el receptor va en tu mano derecha y una tarjeta de ayuda flota en la muñeca izquierda. Gatillo/A = OK, A/X y B/Y cambian de baliza, grip activa la guía acústica y presionar el stick muestra la ayuda.',
    highlight:
      'Si usas Cardboard sin mandos, mantén pulsado el botón del visor y mira hacia donde quieras avanzar. Todo WebXR requiere HTTPS o localhost; sin visor puedes seguir con teclado, joysticks táctiles o un mando de PC.',
  },
];

export const TutorialModal: React.FC<TutorialModalProps> = ({
  open,
  onClose,
}) => {
  const [step, setStep] = useState(0);
  if (!open) return null;

  const current = TUTORIAL_STEPS[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl p-5 text-slate-100 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-sky-400 font-extrabold text-sm">
            <HelpCircle size={18} />
            <span>Guía Rápida · Prototipo Interactivo WTS</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-sky-500/15 border border-sky-500/40 text-sky-300">
              <Icon size={22} />
            </div>
            <h3 className="text-base font-black text-white">{current.title}</h3>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {current.body}
          </p>

          <div className="rounded-2xl bg-slate-800/90 border border-slate-700 p-3 text-xs text-sky-200 leading-relaxed">
            {current.highlight}
          </div>
        </div>

        {/* Step dots + navigation */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div className="flex gap-1.5">
            {TUTORIAL_STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setStep(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === step ? 'w-6 bg-sky-400' : 'w-2 bg-slate-700'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200"
              >
                Anterior
              </button>
            )}
            {step < TUTORIAL_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs font-black text-slate-950"
              >
                Siguiente
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-black text-slate-950"
              >
                ¡Comenzar Misión!
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const SchematicReferenceModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl p-4 text-slate-100 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-sm text-sky-300">
            <ImageIcon size={18} />
            <span>Boceto Conceptual de Referencia · Sistema WTS</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold"
          >
            Cerrar
          </button>
        </div>
        <img
          src={`${import.meta.env.BASE_URL}esquematico-wts.jpg`}
          alt="Esquemático WTS — Arnés pectoral y receptor del rescatista"
          className="w-full rounded-2xl border border-slate-700 bg-white"
        />
      </div>
    </div>
  );
};

export const MissionOutcomeOverlay: React.FC<{
  phase: MissionPhase;
  beacons: SurvivorBeacon[];
  elapsedSec: number;
  dismissed: boolean;
  onDismiss: () => void;
  onRestart: () => void;
}> = ({ phase, beacons, elapsedSec, dismissed, onDismiss, onRestart }) => {
  if (
    dismissed ||
    (phase !== 'rescate_completado' && phase !== 'tiempo_agotado')
  ) {
    return null;
  }

  const isWin = phase === 'rescate_completado';
  const rescuedCount = beacons.filter((b) => b.rescued).length;
  const mins = Math.floor(elapsedSec / 60);
  const secs = Math.floor(elapsedSec % 60)
    .toString()
    .padStart(2, '0');

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl p-5 text-slate-100 space-y-4">
        <div className="text-center space-y-1">
          <div
            className={`mx-auto w-12 h-12 rounded-2xl flex items-center justify-center ${
              isWin
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
            }`}
          >
            {isWin ? <CheckCircle2 size={28} /> : <Clock size={28} />}
          </div>
          <h2 className="text-xl font-black">
            {isWin
              ? '¡Operación de Rescate WTS Completada!'
              : 'Tiempo Operativo Finalizado'}
          </h2>
          <p className="text-xs text-slate-300">
            {isWin
              ? `Localizaste y pusiste a salvo a los ${rescuedCount}/${beacons.length} supervivientes en ${mins}:${secs} usando telemetría TinyML y rastreo RF de 433 MHz.`
              : `Lograste rescatar a ${rescuedCount} de ${beacons.length} personas. Puedes reiniciar para optimizar la búsqueda o seguir explorando el simulador.`}
          </p>
        </div>

        <div className="space-y-1.5">
          {beacons.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700/70 text-xs"
            >
              <div>
                <span className="font-mono font-bold text-white">{b.id}</span>
                <span className="ml-2 text-slate-400 text-[11px]">
                  {b.sectorName}
                </span>
              </div>
              <span
                className={`font-bold ${
                  b.rescued ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {b.rescued
                  ? `Rescatado (${b.rescuedAtSec}s)`
                  : `Pendiente · Bat ${Math.round(b.batteryPct)}%`}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onRestart}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5"
          >
            <RotateCcw size={15} />
            <span>Nueva Misión</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
          >
            Seguir explorando
          </button>
        </div>
      </div>
    </div>
  );
};
