"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CircleHelp,
  ClipboardCheck,
  Coins,
  HandCoins,
  Landmark,
  MessageCircle,
  Package,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { openAyniChat } from "~~/components/alpacto/AyniGuideChat";
import { Button } from "~~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~~/components/ui/tabs";

const FLOW_STEPS = [
  {
    icon: ShoppingCart,
    title: "El comprador separa el dinero",
    body: "Antes de que lleves tu fibra, ya hay una orden con fondos reservados. Eso significa que tu pago no depende de promesas.",
  },
  {
    icon: Package,
    title: "La asociación registra tu lote",
    body: "En el punto de acopio reciben tu fibra y le dan un número. Tú debes confirmar: “Sí, es mi fibra” o declinar si hay un error.",
  },
  {
    icon: ClipboardCheck,
    title: "El inspector pesa y clasifica",
    body: "Solo después de tu confirmación. Registra peso y calidad con foto. Esa información va a revisión automática.",
  },
  {
    icon: ShieldCheck,
    title: "Ayni revisa que todo cuadre",
    body: "Es una revisión automática. No cambia tu pago; solo avisa si algo no coincide (por ejemplo, el peso de la foto con el declarado).",
  },
  {
    icon: Scale,
    title: "Tú decides",
    body: "Si todo está bien, aceptas. Si algo no te parece, pides un nuevo pesaje. Nadie decide por ti.",
  },
  {
    icon: HandCoins,
    title: "Recibes tu liquidación",
    body: "Cuando aceptas, se calcula cuánto te corresponde y se muestra como pago simulado en soles.",
  },
] as const;

const GLOSSARY = [
  {
    term: "Campaña",
    icon: Landmark,
    simple: "La temporada o acuerdo de compra.",
    detail:
      "Es el marco general: quién compra, en qué fechas y con qué precios. Todos los lotes de esa venta siguen las mismas reglas.",
    example: "Ej. “Campaña Alpasur 2026” con precio por kg para FINE, MEDIUM, etc.",
  },
  {
    term: "Orden",
    icon: ShoppingCart,
    simple: "El contrato de compra ya fondeado.",
    detail:
      "Es el pedido concreto del comprador dentro de una campaña. Tiene dinero apartado en una cuenta de garantía.",
    example: "Ej. “Orden ALP-2026-001” por 41 kg con fondos asegurados.",
  },
  {
    term: "Lote",
    icon: Package,
    simple: "Tu fibra entregada, con número.",
    detail:
      "Es lo que tú llevas al acopio. Cada lote tiene peso, calidad y estado (registrado, inspeccionado, liquidado, etc.).",
    example: "Ej. “Lote 3f4a… de 42.5 kg, estado: inspeccionado”.",
  },
  {
    term: "Acopio",
    icon: Building2,
    simple: "El lugar donde entregas tu fibra.",
    detail: "Es el punto físico de la asociación donde reciben y pesan la lana de todos los productores.",
    example: "El local o almacén de la asociación.",
  },
  {
    term: "Pesaje / inspección",
    icon: ClipboardCheck,
    simple: "Medir y revisar tu fibra.",
    detail: "Un inspector pesa el lote, lo clasifica (FINE, MEDIUM…) y toma fotos. Eso define tu pago.",
    example: "El inspector registra 42.5 kg y sube la foto de la balanza.",
  },
  {
    term: "Ayni Auditor",
    icon: ShieldCheck,
    simple: "La revisión automática.",
    detail:
      "Es un sistema que revisa fotos y cálculos para detectar errores. No mueve tu dinero; solo avisa si algo no cuadra.",
    example: "Ayni compara el peso declarado con el de la foto de la balanza.",
  },
  {
    term: "Liquidación",
    icon: HandCoins,
    simple: "El cálculo final de tu pago.",
    detail: "Es la cuenta en soles: peso × precio, más prima de calidad, menos comisiones de asociación y plataforma.",
    example: "42.5 kg FINE = S/ X bruto + prima − comisiones = S/ Y neto.",
  },
  {
    term: "Fondos asegurados",
    icon: Wallet,
    simple: "Dinero separado para tu pago.",
    detail: "Es una cuenta de garantía donde el comprador aparta el dinero antes de que entregues tu fibra.",
    example: "La orden muestra “Fondos asegurados” porque ya hay dinero reservado.",
  },
  {
    term: "Nuevo pesaje",
    icon: Scale,
    simple: "Pedir que pesen otra vez.",
    detail: "Si no estás de acuerdo con el peso o la revisión, puedes solicitar que se pese de nuevo. Es tu derecho.",
    example: "Pides nuevo pesaje porque el número no te parece correcto.",
  },
  {
    term: "Prima de calidad",
    icon: Coins,
    simple: "Extra por buena fibra.",
    detail: "Si tu fibra es de mejor categoría, ganas un extra por kilo además del precio base.",
    example: "Prima +S/ 2.00/kg si tu fibra es FINE.",
  },
] as const;

const FAQ = [
  {
    q: "¿Por qué no veo mi lote todavía?",
    a: "Tu lote aparece cuando la asociación lo registra en el acopio. Antes de eso no hay nada en el sistema. Si ya entregaste y no aparece, pide al encargado que confirme el registro.",
  },
  {
    q: "¿Qué pasa si el lote no es mío o los datos están mal?",
    a: "En el detalle del lote puedes declinar y abrir una disputa (peso incorrecto, fibra ajena, orden equivocada). La asociación lo ve en “Disputas” y puede corregir, reasignar o cancelar el lote.",
  },
  {
    q: "¿Qué es Ayni y por qué revisa mi lote?",
    a: "Ayni es una revisión automática, no una persona. Mira la foto de la balanza, la ficha y los cálculos para avisar si algo no coincide. No cambia tu peso ni tu pago; solo marca “Aprobado” o “Revisión”. En el detalle del lote verás la explicación y podrás pedir un nuevo pesaje.",
  },
  {
    q: "¿Qué pasa si pido un nuevo pesaje?",
    a: "Tu lote pasa a estado “Nuevo pesaje”. El inspector vuelve a pesar y revisar, y Ayni lo vuelve a revisar. Después tú decides si aceptas la nueva liquidación.",
  },
  {
    q: "¿Por qué el botón “Aceptar y retirar” está apagado?",
    a: "Solo se activa cuando Ayni ya aprobó tu lote (o dio aviso leve) y aún no está liquidado. Si está apagado, es porque falta la revisión o porque ya lo cobraste.",
  },
  {
    q: "¿Dónde veo el precio y las comisiones?",
    a: "En “Mis lotes” toca un lote. Ahí ves peso, categoría, bruto, prima y comisiones. La guía “Tus órdenes” del panel también muestra el precio por kg de la campaña.",
  },
  {
    q: "¿Qué significa “Fondos asegurados”?",
    a: "Que el comprador ya apartó el dinero para pagar esa orden. Tu lote está dentro de esa orden, así que tu pago tiene respaldo antes de que entregues tu fibra.",
  },
] as const;

export function ProducerGuide() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Guía</h1>
          <p className="text-muted-foreground">Entiende cómo funciona tu venta de fibra, en palabras simples.</p>
        </div>
        <button
          type="button"
          onClick={() => openAyniChat()}
          className="flex max-w-md items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-3 text-left transition hover:border-primary/40 hover:bg-primary/10"
        >
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">¿Aún no te queda claro?</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
              Pregúntale directo a <span className="font-medium text-primary">Ayni</span>. Haz clic aquí para abrir el
              chat.
            </span>
          </span>
        </button>
      </div>

      <Tabs defaultValue="flujo" className="w-full">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="flujo">Cómo funciona</TabsTrigger>
          <TabsTrigger value="palabras">Palabras clave</TabsTrigger>
          <TabsTrigger value="faq">Preguntas frecuentes</TabsTrigger>
        </TabsList>

        <TabsContent value="flujo" className="mt-6">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>De tu fibra a tu pago</CardTitle>
                <CardDescription>
                  Este es el camino completo. Tú solo apareces al final, pero puedes mirar cada paso.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="relative">
                  {FLOW_STEPS.map((step, i) => (
                    <li key={step.title} className="relative pb-8 pl-10 last:pb-0">
                      {i < FLOW_STEPS.length - 1 ? (
                        <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-border" aria-hidden />
                      ) : null}
                      <span className="absolute left-0 top-0 flex size-8 items-center justify-center rounded-full border bg-background">
                        <step.icon className="h-4 w-4 text-primary" />
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <p className="m-0 font-medium leading-snug">{step.title}</p>
                        <p className="m-0 text-sm leading-snug text-muted-foreground">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card className="bg-muted/30">
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Cuando tu lote ya esté listo, podrás revisarlo y decidir en “Mis lotes”.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/producer/lots">
                    Ver mis lotes <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="palabras" className="mt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GLOSSARY.map(item => (
              <Card key={item.term} className="flex flex-col">
                <CardHeader className="flex flex-row items-center gap-3 pb-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <item.icon className="h-4.5 w-4.5 text-primary" />
                  </span>
                  <div>
                    <CardTitle className="text-base">{item.term}</CardTitle>
                    <CardDescription className="mt-0.5 text-sm">{item.simple}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <p className="text-muted-foreground">{item.detail}</p>
                  <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">{item.example}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="faq" className="mt-6">
          <div className="flex flex-col gap-3">
            {FAQ.map((item, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-start gap-3 pb-3">
                  <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <CardTitle className="text-base font-medium">{item.q}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
