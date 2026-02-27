export const CLIENT_OCASIONAL = "Cliente Ocasional";

export const COMPANY_INFO = {
    name: "CASA SMOKE Y ARTE OT SSOT SAS",
    nit: "902002935",
    address: "Cl 63 B No. 22 - 16, BogotA D.C.",
    phone: "3022784938",
    email: "casasmokeyarte@casasmokeyarte.com",
    logo: "/logo.png"
};

export const PAYMENT_MODES = {
    CONTADO: 'Efectivo',
    CREDITO: 'Credito',
    TRANSFERENCIA: 'Transferencia',
    TARJETA: 'Tarjeta',
    OTROS: 'Otros'
};

export const CREDIT_LEVELS = {
    ESTANDAR: { label: 'EstAndar (Sin Credito)', discount: 0, maxInvoice: 0 },
    CREDITO_SIN_DESCUENTO: { label: 'Credito Sin Descuento', discount: 0, maxInvoice: 0 },
    NIVEL_1: { label: 'Nivel 1', discount: 5, maxInvoice: 150000 },
    NIVEL_2: { label: 'Nivel 2', discount: 10, maxInvoice: 270000 },
    NIVEL_3: { label: 'Nivel 3', discount: 15, maxInvoice: 350000 },
    EMPLEADO: { label: 'Empleado', discount: 20, maxInvoice: 500000 }
};

export const INITIAL_REGISTERED_CLIENT = {
    id: '',
    name: '',
    document: '',
    address: '',
    phone: '',
    creditLimit: 0,
    creditLevel: 'ESTANDAR',
    approvedTerm: 30, // days
    discount: 0 // percentage
};

export const INITIAL_INVOICE_STATE = {
    clientName: CLIENT_OCASIONAL,
    items: [],
    deliveryFee: 0,
    paymentMode: PAYMENT_MODES.CONTADO,
    isDraft: true
};
