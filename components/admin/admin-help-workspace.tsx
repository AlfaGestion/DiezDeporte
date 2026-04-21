import type { AdminConfigField, AdminConfigFieldType } from "@/lib/types";

type HelpCard = {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
};

type ConfigHelpSection = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  sectionNames: string[];
};

const HELP_CARDS: HelpCard[] = [
  {
    eyebrow: "Inicio rapido",
    title: "Como usar la web en el dia a dia",
    description:
      "Este bloque resume el uso operativo para atender pedidos sin entrar en detalles tecnicos.",
    items: [
      "Deja abierta la vista Pedidos si estas trabajando durante el horario comercial. Cuando entra un pedido nuevo, el panel avisa con un sonido y una alerta visual.",
      "Usa los filtros para separar pedidos pendientes, procesados, retiros listos o finalizados.",
      "Abre el detalle del pedido solo cuando necesites ver productos, cliente, entrega o ejecutar una accion puntual.",
      "Si el cliente consulta por su compra, puedes verificar numero, estado, pago y tipo de entrega desde el listado.",
    ],
  },
  {
    eyebrow: "Ciclo del pedido",
    title: "Que hacer desde que entra una compra",
    description:
      "La idea es que cada pedido pase por un flujo claro, sin saltearse controles.",
    items: [
      "PENDIENTE: el pedido ya entro. Revisa si el pago esta pendiente, aprobado o si hubo un fallo.",
      "APROBADO: el pago ya esta listo o el pedido fue validado manualmente. Desde ahi sigue el trabajo interno.",
      "FACTURADO y PREPARANDO: se usa cuando el pedido ya entro en preparacion o ya se genero el comprobante.",
      "LISTO_PARA_RETIRO: se usa para pedidos de retiro cuando ya pueden pasar por el local.",
      "ENVIADO: se usa cuando el pedido salio del local rumbo al cliente.",
      "ENTREGADO: cierra el flujo. En retiro conviene registrar siempre quien lo retiro y, si corresponde, con que se cobro.",
      "CANCELADO o ERROR: se usan solo cuando el pedido no puede seguir su curso normal.",
    ],
  },
  {
    eyebrow: "Pagos",
    title: "Como leer y operar el estado del pago",
    description:
      "El estado del pago y el estado del pedido no siempre avanzan al mismo tiempo.",
    items: [
      "Si el pago esta pendiente, el pedido puede existir pero todavia no deberia avanzar a facturacion normal.",
      "Si el pago esta aprobado, ya puedes seguir con la operatoria del pedido segun el tipo de entrega.",
      "Si el cliente va a pagar en el local, el cobro se termina de informar en el momento del retiro.",
      "Si hubo un problema al iniciar el pago, el panel permite revisar el caso y pasar el pedido a retiro con pago local si esa alternativa esta habilitada.",
    ],
  },
  {
    eyebrow: "Retiro en local",
    title: "Como entregar un pedido por mostrador",
    description:
      "El flujo de retiro esta pensado para validar una sola vez el codigo y dejar trazabilidad.",
    items: [
      "Cuando el pedido queda LISTO_PARA_RETIRO, el cliente recibe su codigo y puede mostrar tambien el QR.",
      "En la ficha del pedido y en la vista Retiros puedes escanear el QR o pegar el codigo para validarlo.",
      "Al confirmar el retiro debes completar nombre, apellido y DNI si la configuracion del local lo exige.",
      "Si el pedido se paga en el local, el sistema te pide elegir el metodo de pago antes de cerrar el retiro.",
      "Una vez registrado, el codigo no puede volver a usarse y el pedido queda marcado como ENTREGADO.",
    ],
  },
  {
    eyebrow: "Envios",
    title: "Como manejar pedidos con envio",
    description:
      "Para envios, el foco principal es avanzar el estado y dejar bien cargada la informacion de despacho.",
    items: [
      "Verifica que el domicilio y la localidad del cliente esten correctos antes de cerrar la preparacion.",
      "Cuando el pedido sale del local, cambia el estado a ENVIADO.",
      "Si manejas numero de seguimiento, cargalo desde el detalle para que quede asociado al pedido.",
      "Una vez recibido por el cliente, marca el pedido como ENTREGADO para cerrar la operacion.",
    ],
  },
  {
    eyebrow: "Configuracion",
    title: "Que puedes cambiar sin tocar codigo",
    description:
      "La seccion Configuracion esta armada por bloques para que cada persona ajuste solo lo necesario.",
    items: [
      "Informacion del negocio: nombre, logo, horarios, direccion y datos de contacto.",
      "Checkout: validaciones, reserva de stock, visibilidad de articulos y comportamiento del formulario.",
      "Pagos: Mercado Pago, reintentos, fallos y alternativas comerciales.",
      "Pedidos y Retiro en local: flujo de trabajo, QR, datos obligatorios al entregar y horarios de retiro.",
      "Emails, estados y facturacion: mensajes automaticos, colores de estados y textos operativos.",
      "Guarda cada bloque cuando termines. No hace falta tocar todo el panel para cambiar una sola cosa.",
    ],
  },
  {
    eyebrow: "Usuarios",
    title: "Permisos del panel",
    description:
      "No todos los usuarios tienen el mismo alcance dentro del admin.",
    items: [
      "Un operador puede gestionar pedidos y usar el mostrador segun sus permisos.",
      "Un superadmin puede ademas crear, editar o deshabilitar usuarios del panel.",
      "Conviene que cada persona use su propia cuenta para que la operacion quede ordenada.",
    ],
  },
  {
    eyebrow: "Buenas practicas",
    title: "Recomendaciones para trabajar mejor",
    description:
      "Pequenas rutinas que ayudan a evitar errores operativos.",
    items: [
      "No cierres un retiro sin datos si el local necesita trazabilidad. Esa opcion solo conviene usarla como excepcion.",
      "Antes de marcar ENTREGADO, revisa que el pedido corresponda al cliente correcto y que el cobro este bien informado.",
      "Si algo no aparece en el listado, revisa primero los filtros activos y la vista seleccionada.",
      "Si estas esperando pedidos nuevos, mantente en el admin y deja la vista abierta para recibir el aviso automatico.",
    ],
  },
];

const CONFIG_HELP_SECTIONS: ConfigHelpSection[] = [
  {
    id: "negocio",
    eyebrow: "Configuracion",
    title: "Informacion del negocio",
    description:
      "Todo lo que el cliente ve en la web: identidad, contacto, horarios, redes y textos comerciales.",
    sectionNames: ["Configuracion web"],
  },
  {
    id: "checkout",
    eyebrow: "Configuracion",
    title: "Checkout",
    description:
      "Define como compra el cliente, que validaciones se hacen y que pasa con stock, formulario y email inicial.",
    sectionNames: ["Checkout"],
  },
  {
    id: "pagos",
    eyebrow: "Configuracion",
    title: "Pagos",
    description:
      "Explica como cobrar online, como reintentar, como avisar errores y cuando ofrecer retiro con pago local.",
    sectionNames: ["Pagos"],
  },
  {
    id: "pedidos",
    eyebrow: "Configuracion",
    title: "Pedidos",
    description:
      "Reune las opciones que ordenan el flujo interno del pedido y los datos base con los que trabaja la web.",
    sectionNames: ["Pedidos"],
  },
  {
    id: "retiro-local",
    eyebrow: "Configuracion",
    title: "Retiro en local",
    description:
      "Controla horarios de retiro, generacion de QR y datos obligatorios al momento de entregar.",
    sectionNames: ["Retiro en local"],
  },
  {
    id: "emails",
    eyebrow: "Configuracion",
    title: "Emails",
    description:
      "Aca se aclara cada mensaje automatico que puede salir al cliente y que variables puedes usar.",
    sectionNames: ["Emails"],
  },
  {
    id: "estados",
    eyebrow: "Configuracion",
    title: "Estados del pedido",
    description:
      "Cada estado puede tener nombre visible, colores y envio automatico de email al entrar.",
    sectionNames: ["Estados"],
  },
  {
    id: "facturacion",
    eyebrow: "Configuracion",
    title: "Facturacion",
    description:
      "Incluye el mail de factura y las opciones automaticas que se aplican al facturar segun el tipo de entrega.",
    sectionNames: ["Facturacion y documentos"],
  },
];

const TECHNICAL_CARDS: HelpCard[] = [
  {
    eyebrow: "Tecnico",
    title: "Estructura operativa principal",
    description:
      "Estas notas avanzadas solo se muestran para el usuario tecnico habilitado.",
    items: [
      "Los pedidos web viven en dbo.WEB_V_MV_PEDIDOS y los cambios de estado en dbo.WEB_V_MV_PEDIDOS_LOGS.",
      "El comprobante comercial se genera en V_MV_Cpte y sus items en V_MV_CpteInsumos.",
      "La configuracion del negocio se toma desde TA_CONFIGURACION con fallback a .env cuando falta algun valor.",
      "Los usuarios del panel se controlan desde TA_UsuariosWeb.",
    ],
  },
  {
    eyebrow: "Integraciones",
    title: "Flujos tecnicos importantes",
    description:
      "Resumen rapido para soporte o mantenimiento del sistema.",
    items: [
      "Mercado Pago usa preferencias, retorno y webhook para mantener el estado del pedido sincronizado.",
      "El admin consulta pedidos desde servicios internos y algunas acciones refrescan estado, pago o datos de retiro.",
      "El panel de pedidos ahora consulta un snapshot liviano para detectar pedidos nuevos y disparar notificacion local.",
      "Cuando un pedido genera comprobante, el encabezado comercial se resincroniza con datos del cliente, retiro y cobro segun el estado actual.",
    ],
  },
];

function getConfigFieldTypeLabel(type: AdminConfigFieldType) {
  switch (type) {
    case "boolean":
      return "Si/No";
    case "password":
      return "Clave";
    case "textarea":
      return "Texto largo";
    case "color":
      return "Color";
    default:
      return "Texto";
  }
}

function describeConfigField(field: AdminConfigField, showTechnicalSection: boolean) {
  if (showTechnicalSection) {
    return field.description;
  }

  switch (field.key) {
    case "APP_WRITE_STOCK_MOVEMENTS":
      return "Si esta activo, el sistema registra el movimiento de stock cuando el pedido avanza segun la operatoria definida.";
    case "APP_MP_ORDER_TC":
      return "Tipo de comprobante usado en pagos web. Si lo dejas vacio, toma el valor general del pedido.";
    case "APP_ORDER_TC":
      return "Tipo de comprobante general que usa la web al registrar pedidos.";
    case "APP_ORDER_BRANCH":
      return "Sucursal interna con la que la web registra el pedido.";
    case "APP_ORDER_LETTER":
      return "Letra interna del comprobante o pedido.";
    case "APP_PAYMENT_CONDITION":
      return "Condicion comercial aplicada por defecto a los pedidos web.";
    case "APP_CUSTOMER_ACCOUNT":
      return "Cuenta cliente que se usa por defecto para pedidos de consumidor final.";
    case "APP_ORDER_USER":
      return "Usuario interno que queda asociado al pedido grabado desde la web.";
    default:
      return field.description
        .replace("si no viene de configuracion SQL.", "si no lo definiste en la configuracion principal.")
        .replace("configuracion SQL", "configuracion principal");
  }
}

function getConfigGroups(fields: AdminConfigField[], sectionNames: string[]) {
  const groups = new Map<string, AdminConfigField[]>();

  for (const field of fields) {
    if (!sectionNames.includes(field.section)) {
      continue;
    }

    const groupName = field.group || "General";
    const items = groups.get(groupName) || [];
    items.push(field);
    groups.set(groupName, items);
  }

  return Array.from(groups.entries()).map(([name, items]) => ({
    name,
    items,
  }));
}

function HelpCardSection({ card }: { card: HelpCard }) {
  return (
    <section className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
        {card.eyebrow}
      </div>
      <h3 className="mt-2 text-xl font-semibold text-[color:var(--admin-title)]">
        {card.title}
      </h3>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--admin-text)]">
        {card.description}
      </p>
      <div className="mt-5 grid gap-3">
        {card.items.map((item) => (
          <div
            key={item}
            className="rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-4 text-sm leading-6 text-[color:var(--admin-title)]"
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function ConfigGuideBlock(props: {
  section: ConfigHelpSection;
  fields: AdminConfigField[];
  showTechnicalSection: boolean;
}) {
  const { section, fields, showTechnicalSection } = props;
  const groups = getConfigGroups(fields, section.sectionNames);

  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
        {section.eyebrow}
      </div>
      <h3 className="mt-2 text-xl font-semibold text-[color:var(--admin-title)]">
        {section.title}
      </h3>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--admin-text)]">
        {section.description}
      </p>

      <div className="mt-5 grid gap-4">
        {groups.map((group, index) => (
          <details
            key={`${section.id}-${group.name}`}
            open={index === 0}
            className="rounded-[22px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-5 py-4"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--admin-title)]">{group.name}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.12em] text-[color:var(--admin-text)]">
                  {group.items.length} {group.items.length === 1 ? "campo" : "campos"}
                </div>
              </div>
              <span className="rounded-full border border-[color:var(--admin-card-line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--admin-text)]">
                Ver detalle
              </span>
            </summary>

            <div className="mt-4 grid gap-3">
              {group.items.map((field) => (
                <div
                  key={field.key}
                  className="rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[color:var(--admin-title)]">
                      {field.label}
                    </div>
                    <span className="rounded-full bg-black/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--admin-text)] dark:bg-white/[0.06]">
                      {getConfigFieldTypeLabel(field.type)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--admin-text)]">
                    {describeConfigField(field, showTechnicalSection)}
                  </p>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function AdminHelpWorkspace({
  storeName,
  configFields,
  showTechnicalSection,
}: {
  storeName: string;
  configFields: AdminConfigField[];
  showTechnicalSection: boolean;
}) {
  return (
    <section className="space-y-6">
      <section className="rounded-[30px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
          Guia interna
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-[color:var(--admin-title)]">
          Instructivo completo de {storeName}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-[color:var(--admin-text)]">
          Esta seccion esta pensada para que cualquier persona del negocio entienda como usar la
          web, como seguir un pedido y donde tocar cada cosa del panel sin depender del
          desarrollador.
        </p>
      </section>

      <div className="grid gap-6">
        {HELP_CARDS.map((card) => (
          <HelpCardSection key={card.title} card={card} />
        ))}
      </div>

      <section className="rounded-[30px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
          Configuracion detallada
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-[color:var(--admin-title)]">
          Aclaracion completa de cada bloque del admin
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-[color:var(--admin-text)]">
          Debajo tienes la explicacion completa de todos los bloques y campos reales de la
          seccion Configuracion. Cada acordeon corresponde a un grupo del panel y cada item
          explica para que sirve ese dato antes de guardarlo.
        </p>
      </section>

      <div className="grid gap-6">
        {CONFIG_HELP_SECTIONS.map((section) => (
          <ConfigGuideBlock
            key={section.id}
            section={section}
            fields={configFields}
            showTechnicalSection={showTechnicalSection}
          />
        ))}
      </div>

      {showTechnicalSection ? (
        <div className="grid gap-6">
          {TECHNICAL_CARDS.map((card) => (
            <HelpCardSection key={card.title} card={card} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
