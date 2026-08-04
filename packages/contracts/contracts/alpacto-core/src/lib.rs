#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::vec::Vec;

use alloy_primitives::{Address, B256, U256, U32, U64, U8};
use openzeppelin_stylus::access::control::{self, AccessControl, IAccessControl};
use openzeppelin_stylus::token::erc20::interface::Erc20Interface;
use stylus_sdk::{alloy_sol_types::sol, call::Error as CallError, prelude::*, stylus_core::log};

/// Role hashes (keccak256 of role name). DEFAULT_ADMIN_ROLE is [0; 32].
pub const PLATFORM_ADMIN_ROLE: B256 = B256::new([
    0x52, 0x46, 0x55, 0x6c, 0x0a, 0xb2, 0x16, 0xb5, 0xb3, 0x25, 0xad, 0x7c, 0x53, 0x9b, 0xfb, 0xd1,
    0xa0, 0x7c, 0x76, 0x87, 0x73, 0xcd, 0xf8, 0x10, 0xfe, 0xcd, 0x3c, 0x33, 0x75, 0xc2, 0x74, 0x07,
]);
pub const ASSOCIATION_ROLE: B256 = B256::new([
    0xc1, 0x1f, 0x5b, 0x97, 0x35, 0xb8, 0x09, 0xc0, 0x45, 0xb2, 0x9a, 0x20, 0xa2, 0x7b, 0xb6, 0xd4,
    0xf4, 0xdb, 0xec, 0x96, 0x57, 0x51, 0x51, 0x56, 0x8a, 0xb0, 0xb5, 0xef, 0xe2, 0xab, 0x56, 0x16,
]);
pub const BUYER_ROLE: B256 = B256::new([
    0xf8, 0xcd, 0x32, 0xed, 0x93, 0xfc, 0x2f, 0x9f, 0xc7, 0x81, 0x52, 0xa1, 0x48, 0x07, 0xc9, 0x60,
    0x9a, 0xf3, 0xd9, 0x9c, 0x5f, 0xe4, 0xdc, 0x6b, 0x10, 0x6a, 0x80, 0x1a, 0xad, 0xdf, 0xe9, 0x0e,
]);
pub const INSPECTOR_ROLE: B256 = B256::new([
    0x27, 0x3d, 0xcf, 0x21, 0x36, 0xc7, 0xd8, 0xef, 0x63, 0x2b, 0xb8, 0xef, 0x13, 0xdb, 0xca, 0x69,
    0xa8, 0xf3, 0x6f, 0xa6, 0x20, 0xc7, 0x46, 0x86, 0x71, 0xb3, 0x15, 0x3d, 0x46, 0xa2, 0x11, 0xc0,
]);
pub const AUDITOR_AGENT_ROLE: B256 = B256::new([
    0x68, 0x94, 0x0d, 0xcb, 0x99, 0x10, 0x46, 0xec, 0xaa, 0x34, 0x47, 0xe7, 0x80, 0x1b, 0xab, 0xa5,
    0x95, 0x74, 0xa5, 0x38, 0x51, 0xf6, 0xb0, 0x40, 0x0a, 0xc7, 0xcd, 0x47, 0xed, 0xf2, 0xd3, 0x10,
]);

pub mod order_status {
    pub const DRAFT: u8 = 0;
    pub const FUNDED: u8 = 1;
    pub const ACCEPTING_LOTS: u8 = 2;
    pub const PARTIALLY_SETTLED: u8 = 3;
    pub const COMPLETED: u8 = 4;
    pub const CANCELLED: u8 = 5;
}

pub mod lot_status {
    pub const REGISTERED: u8 = 0;
    pub const INSPECTION_SUBMITTED: u8 = 1;
    pub const AUDITING: u8 = 2;
    pub const READY_FOR_REVIEW: u8 = 3;
    pub const REVIEW_REQUIRED: u8 = 4;
    pub const REWEIGHING_REQUESTED: u8 = 5;
    pub const PRODUCER_ACCEPTED: u8 = 6;
    pub const SETTLED: u8 = 7;
    pub const CANCELLED: u8 = 8;
}

pub mod audit_result {
    pub const PASS: u8 = 0;
    pub const WARNING: u8 = 1;
    pub const REVIEW_REQUIRED: u8 = 2;
    pub const UNREADABLE: u8 = 3;
}

sol! {
    #[derive(Debug)]
    event OrderCreated(uint256 indexed orderId, address indexed buyer, address indexed association, bytes32 pricingPolicyHash, uint256 budgetUsdcUnits);
    #[derive(Debug)]
    event OrderFunded(uint256 indexed orderId, uint256 amount, bytes32 paymentReferenceHash, uint256 remainingUsdcUnits);
    #[derive(Debug)]
    event LotRegistered(uint256 indexed orderId, uint256 indexed lotId, address indexed producer);
    #[derive(Debug)]
    event InspectionReferenceSubmitted(uint256 indexed lotId, uint32 version, uint64 weightGrams, uint32 categoryCode, bytes32 evidenceHash);
    #[derive(Debug)]
    event AuditAttestationSubmitted(uint256 indexed lotId, uint32 version, bytes32 reportHash, uint8 result);
    #[derive(Debug)]
    event ReweighingRequested(uint256 indexed lotId, bytes32 reasonHash);
    #[derive(Debug)]
    event SettlementAccepted(uint256 indexed lotId, uint32 version, bytes32 quoteHash, uint256 producerUsdcUnits, uint256 associationUsdcUnits);
    #[derive(Debug)]
    event LotSettled(uint256 indexed lotId, uint256 producerUsdcUnits, uint256 associationUsdcUnits);
    #[derive(Debug)]
    event OrderCompleted(uint256 indexed orderId);

    #[derive(Debug)]
    error Unauthorized(address account, bytes32 neededRole);
    #[derive(Debug)]
    error OrderExists(uint256 orderId);
    #[derive(Debug)]
    error OrderNotFound(uint256 orderId);
    #[derive(Debug)]
    error LotExists(uint256 lotId);
    #[derive(Debug)]
    error LotNotFound(uint256 lotId);
    #[derive(Debug)]
    error InvalidOrderStatus(uint256 orderId, uint8 status);
    #[derive(Debug)]
    error InvalidLotStatus(uint256 lotId, uint8 status);
    #[derive(Debug)]
    error PaymentRefUsed(bytes32 paymentReferenceHash);
    #[derive(Debug)]
    error InvalidAmount();
    #[derive(Debug)]
    error InvalidInspectionVersion(uint256 lotId, uint32 expected, uint32 got);
    #[derive(Debug)]
    error InspectionExists(uint256 lotId, uint32 version);
    #[derive(Debug)]
    error AttestationExists(uint256 lotId, uint32 version);
    #[derive(Debug)]
    error AttestationNotFound(uint256 lotId, uint32 version);
    #[derive(Debug)]
    error InvalidAuditResult(uint8 result);
    #[derive(Debug)]
    error NotProducer(address caller, address producer);
    #[derive(Debug)]
    error VersionMismatch(uint32 current, uint32 got);
    #[derive(Debug)]
    error AttestationNotAcceptable(uint8 result);
    #[derive(Debug)]
    error SplitMismatch(uint256 producerUsdc, uint256 associationUsdc, uint256 remaining);
    #[derive(Debug)]
    error InsufficientOrderBalance(uint256 remaining, uint256 needed);
    #[derive(Debug)]
    error AlreadySettled(uint256 lotId);
    #[derive(Debug)]
    error ZeroAddress();
    #[derive(Debug)]
    error TokenTransferFailed();
    #[derive(Debug)]
    error AccessControlError(address account, bytes32 neededRole);
    #[derive(Debug)]
    error AccessControlBadConfirm();
}

#[derive(SolidityError, Debug)]
pub enum Error {
    Unauthorized(Unauthorized),
    OrderExists(OrderExists),
    OrderNotFound(OrderNotFound),
    LotExists(LotExists),
    LotNotFound(LotNotFound),
    InvalidOrderStatus(InvalidOrderStatus),
    InvalidLotStatus(InvalidLotStatus),
    PaymentRefUsed(PaymentRefUsed),
    InvalidAmount(InvalidAmount),
    InvalidInspectionVersion(InvalidInspectionVersion),
    InspectionExists(InspectionExists),
    AttestationExists(AttestationExists),
    AttestationNotFound(AttestationNotFound),
    InvalidAuditResult(InvalidAuditResult),
    NotProducer(NotProducer),
    VersionMismatch(VersionMismatch),
    AttestationNotAcceptable(AttestationNotAcceptable),
    SplitMismatch(SplitMismatch),
    InsufficientOrderBalance(InsufficientOrderBalance),
    AlreadySettled(AlreadySettled),
    ZeroAddress(ZeroAddress),
    TokenTransferFailed(TokenTransferFailed),
    AccessControlUnauthorized(AccessControlError),
    AccessControlBadConfirmation(AccessControlBadConfirm),
}

impl From<control::Error> for Error {
    fn from(value: control::Error) -> Self {
        match value {
            control::Error::UnauthorizedAccount(e) => Error::AccessControlUnauthorized(
                AccessControlError {
                    account: e.account,
                    neededRole: e.needed_role,
                },
            ),
            control::Error::BadConfirmation(_) => {
                Error::AccessControlBadConfirmation(AccessControlBadConfirm {})
            }
        }
    }
}

sol_storage! {
    pub struct OrderData {
        address buyer;
        address association;
        bytes32 pricing_policy_hash;
        uint256 budget_usdc;
        uint256 funded_usdc;
        uint256 remaining_usdc;
        uint8 status;
        bool exists;
    }

    pub struct LotData {
        uint256 order_id;
        address producer;
        uint8 status;
        uint32 current_version;
        uint32 accepted_version;
        bytes32 accepted_quote_hash;
        uint256 accepted_net_pen_minor;
        uint256 producer_usdc;
        uint256 association_usdc;
        bool exists;
    }

    pub struct InspectionData {
        uint64 weight_grams;
        uint32 category_code;
        bytes32 evidence_hash;
        bool exists;
    }

    pub struct AttestationData {
        bytes32 report_hash;
        uint8 result;
        bool exists;
    }

    #[entrypoint]
    pub struct AlpactoCore {
        AccessControl access;
        address usdc;
        mapping(uint256 => OrderData) orders;
        mapping(bytes32 => bool) used_payment_refs;
        mapping(uint256 => LotData) lots;
        mapping(uint256 => mapping(uint32 => InspectionData)) inspections;
        mapping(uint256 => mapping(uint32 => AttestationData)) attestations;
    }
}

fn u8_of(v: U8) -> u8 {
    v.to::<u8>()
}

fn u32_of(v: U32) -> u32 {
    v.to::<u32>()
}

fn u64_of(v: U64) -> u64 {
    v.to::<u64>()
}

#[public]
#[implements(IAccessControl<Error = Error>)]
impl AlpactoCore {
    #[constructor]
    pub fn constructor(&mut self, admin: Address, usdc_token: Address) -> Result<(), Error> {
        if admin.is_zero() {
            return Err(Error::ZeroAddress(ZeroAddress {}));
        }
        self.usdc.set(usdc_token);
        self.access
            ._grant_role(AccessControl::DEFAULT_ADMIN_ROLE.into(), admin);
        Ok(())
    }

    pub fn usdc_token(&self) -> Address {
        self.usdc.get()
    }

    pub fn platform_admin_role(&self) -> B256 {
        PLATFORM_ADMIN_ROLE
    }

    pub fn association_role(&self) -> B256 {
        ASSOCIATION_ROLE
    }

    pub fn buyer_role(&self) -> B256 {
        BUYER_ROLE
    }

    pub fn inspector_role(&self) -> B256 {
        INSPECTOR_ROLE
    }

    pub fn auditor_agent_role(&self) -> B256 {
        AUDITOR_AGENT_ROLE
    }

    pub fn create_order(
        &mut self,
        order_id: U256,
        buyer: Address,
        association: Address,
        pricing_policy_hash: B256,
        budget_usdc_units: U256,
    ) -> Result<(), Error> {
        self.require_role(BUYER_ROLE)?;
        let sender = self.vm().msg_sender();
        if sender != buyer {
            return Err(Error::Unauthorized(Unauthorized {
                account: sender,
                neededRole: BUYER_ROLE,
            }));
        }
        if buyer.is_zero() || association.is_zero() {
            return Err(Error::ZeroAddress(ZeroAddress {}));
        }
        if budget_usdc_units.is_zero() {
            return Err(Error::InvalidAmount(InvalidAmount {}));
        }
        if self.orders.get(order_id).exists.get() {
            return Err(Error::OrderExists(OrderExists { orderId: order_id }));
        }

        let mut order = self.orders.setter(order_id);
        order.buyer.set(buyer);
        order.association.set(association);
        order.pricing_policy_hash.set(pricing_policy_hash);
        order.budget_usdc.set(budget_usdc_units);
        order.funded_usdc.set(U256::ZERO);
        order.remaining_usdc.set(U256::ZERO);
        order.status.set(U8::from(order_status::DRAFT));
        order.exists.set(true);

        log(
            self.vm(),
            OrderCreated {
                orderId: order_id,
                buyer,
                association,
                pricingPolicyHash: pricing_policy_hash,
                budgetUsdcUnits: budget_usdc_units,
            },
        );
        Ok(())
    }

    pub fn fund_order(
        &mut self,
        order_id: U256,
        amount: U256,
        payment_reference_hash: B256,
    ) -> Result<(), Error> {
        self.require_role(PLATFORM_ADMIN_ROLE)?;
        if amount.is_zero() {
            return Err(Error::InvalidAmount(InvalidAmount {}));
        }
        if self.used_payment_refs.get(payment_reference_hash) {
            return Err(Error::PaymentRefUsed(PaymentRefUsed {
                paymentReferenceHash: payment_reference_hash,
            }));
        }

        let order = self.orders.get(order_id);
        if !order.exists.get() {
            return Err(Error::OrderNotFound(OrderNotFound { orderId: order_id }));
        }
        let status = u8_of(order.status.get());
        if status != order_status::DRAFT
            && status != order_status::FUNDED
            && status != order_status::ACCEPTING_LOTS
        {
            return Err(Error::InvalidOrderStatus(InvalidOrderStatus {
                orderId: order_id,
                status,
            }));
        }

        let from = self.vm().msg_sender();
        self.pull_usdc(from, amount)?;

        self.used_payment_refs.setter(payment_reference_hash).set(true);

        let mut order = self.orders.setter(order_id);
        let funded = order.funded_usdc.get() + amount;
        let remaining = order.remaining_usdc.get() + amount;
        order.funded_usdc.set(funded);
        order.remaining_usdc.set(remaining);
        order.status.set(U8::from(order_status::ACCEPTING_LOTS));

        log(
            self.vm(),
            OrderFunded {
                orderId: order_id,
                amount,
                paymentReferenceHash: payment_reference_hash,
                remainingUsdcUnits: remaining,
            },
        );
        Ok(())
    }

    pub fn register_lot(
        &mut self,
        order_id: U256,
        lot_id: U256,
        producer_account: Address,
    ) -> Result<(), Error> {
        let sender = self.vm().msg_sender();
        if !self.access.has_role(ASSOCIATION_ROLE, sender)
            && !self.access.has_role(INSPECTOR_ROLE, sender)
        {
            return Err(Error::Unauthorized(Unauthorized {
                account: sender,
                neededRole: ASSOCIATION_ROLE,
            }));
        }
        if producer_account.is_zero() {
            return Err(Error::ZeroAddress(ZeroAddress {}));
        }

        let order = self.orders.get(order_id);
        if !order.exists.get() {
            return Err(Error::OrderNotFound(OrderNotFound { orderId: order_id }));
        }
        let status = u8_of(order.status.get());
        if status != order_status::ACCEPTING_LOTS && status != order_status::PARTIALLY_SETTLED {
            return Err(Error::InvalidOrderStatus(InvalidOrderStatus {
                orderId: order_id,
                status,
            }));
        }
        if self.lots.get(lot_id).exists.get() {
            return Err(Error::LotExists(LotExists { lotId: lot_id }));
        }

        let mut lot = self.lots.setter(lot_id);
        lot.order_id.set(order_id);
        lot.producer.set(producer_account);
        lot.status.set(U8::from(lot_status::REGISTERED));
        lot.current_version.set(U32::ZERO);
        lot.accepted_version.set(U32::ZERO);
        lot.exists.set(true);

        log(
            self.vm(),
            LotRegistered {
                orderId: order_id,
                lotId: lot_id,
                producer: producer_account,
            },
        );
        Ok(())
    }

    pub fn submit_inspection_reference(
        &mut self,
        lot_id: U256,
        version: u32,
        weight_grams: u64,
        category_code: u32,
        evidence_hash: B256,
    ) -> Result<(), Error> {
        self.require_role(INSPECTOR_ROLE)?;

        let lot = self.lots.get(lot_id);
        if !lot.exists.get() {
            return Err(Error::LotNotFound(LotNotFound { lotId: lot_id }));
        }
        let status = u8_of(lot.status.get());
        if status != lot_status::REGISTERED
            && status != lot_status::REWEIGHING_REQUESTED
            && status != lot_status::REVIEW_REQUIRED
        {
            return Err(Error::InvalidLotStatus(InvalidLotStatus {
                lotId: lot_id,
                status,
            }));
        }

        let current = u32_of(lot.current_version.get());
        let expected = current + 1;
        if version != expected {
            return Err(Error::InvalidInspectionVersion(InvalidInspectionVersion {
                lotId: lot_id,
                expected,
                got: version,
            }));
        }
        let version_key = U32::from(version);
        if self.inspections.get(lot_id).get(version_key).exists.get() {
            return Err(Error::InspectionExists(InspectionExists {
                lotId: lot_id,
                version,
            }));
        }

        let mut inspections = self.inspections.setter(lot_id);
        let mut inspection = inspections.setter(version_key);
        inspection.weight_grams.set(U64::from(weight_grams));
        inspection.category_code.set(U32::from(category_code));
        inspection.evidence_hash.set(evidence_hash);
        inspection.exists.set(true);

        let mut lot = self.lots.setter(lot_id);
        lot.current_version.set(version_key);
        lot.status.set(U8::from(lot_status::AUDITING));

        log(
            self.vm(),
            InspectionReferenceSubmitted {
                lotId: lot_id,
                version,
                weightGrams: weight_grams,
                categoryCode: category_code,
                evidenceHash: evidence_hash,
            },
        );
        Ok(())
    }

    pub fn submit_audit_attestation(
        &mut self,
        lot_id: U256,
        version: u32,
        report_hash: B256,
        result: u8,
    ) -> Result<(), Error> {
        self.require_role(AUDITOR_AGENT_ROLE)?;

        let lot = self.lots.get(lot_id);
        if !lot.exists.get() {
            return Err(Error::LotNotFound(LotNotFound { lotId: lot_id }));
        }
        let status = u8_of(lot.status.get());
        if status != lot_status::AUDITING {
            return Err(Error::InvalidLotStatus(InvalidLotStatus {
                lotId: lot_id,
                status,
            }));
        }
        let current = u32_of(lot.current_version.get());
        if version != current {
            return Err(Error::VersionMismatch(VersionMismatch {
                current,
                got: version,
            }));
        }
        let version_key = U32::from(version);
        if !self.inspections.get(lot_id).get(version_key).exists.get() {
            return Err(Error::InvalidInspectionVersion(InvalidInspectionVersion {
                lotId: lot_id,
                expected: version,
                got: 0,
            }));
        }
        if self.attestations.get(lot_id).get(version_key).exists.get() {
            return Err(Error::AttestationExists(AttestationExists {
                lotId: lot_id,
                version,
            }));
        }
        if result > audit_result::UNREADABLE {
            return Err(Error::InvalidAuditResult(InvalidAuditResult { result }));
        }

        let mut attestations = self.attestations.setter(lot_id);
        let mut attestation = attestations.setter(version_key);
        attestation.report_hash.set(report_hash);
        attestation.result.set(U8::from(result));
        attestation.exists.set(true);

        let new_status = match result {
            x if x == audit_result::PASS || x == audit_result::WARNING => {
                lot_status::READY_FOR_REVIEW
            }
            _ => lot_status::REVIEW_REQUIRED,
        };
        self.lots.setter(lot_id).status.set(U8::from(new_status));

        log(
            self.vm(),
            AuditAttestationSubmitted {
                lotId: lot_id,
                version,
                reportHash: report_hash,
                result,
            },
        );
        Ok(())
    }

    pub fn request_reweighing(&mut self, lot_id: U256, reason_hash: B256) -> Result<(), Error> {
        let lot = self.lots.get(lot_id);
        if !lot.exists.get() {
            return Err(Error::LotNotFound(LotNotFound { lotId: lot_id }));
        }
        let producer = lot.producer.get();
        let sender = self.vm().msg_sender();
        if sender != producer {
            return Err(Error::NotProducer(NotProducer {
                caller: sender,
                producer,
            }));
        }
        let status = u8_of(lot.status.get());
        if status != lot_status::READY_FOR_REVIEW && status != lot_status::REVIEW_REQUIRED {
            return Err(Error::InvalidLotStatus(InvalidLotStatus {
                lotId: lot_id,
                status,
            }));
        }

        self.lots
            .setter(lot_id)
            .status
            .set(U8::from(lot_status::REWEIGHING_REQUESTED));

        log(
            self.vm(),
            ReweighingRequested {
                lotId: lot_id,
                reasonHash: reason_hash,
            },
        );
        Ok(())
    }

    pub fn accept_settlement(
        &mut self,
        lot_id: U256,
        version: u32,
        quote_hash: B256,
        net_pen_minor: U256,
        producer_usdc_units: U256,
        association_usdc_units: U256,
    ) -> Result<(), Error> {
        let lot = self.lots.get(lot_id);
        if !lot.exists.get() {
            return Err(Error::LotNotFound(LotNotFound { lotId: lot_id }));
        }
        let producer = lot.producer.get();
        let sender = self.vm().msg_sender();
        if sender != producer {
            return Err(Error::NotProducer(NotProducer {
                caller: sender,
                producer,
            }));
        }
        let status = u8_of(lot.status.get());
        if status != lot_status::READY_FOR_REVIEW {
            return Err(Error::InvalidLotStatus(InvalidLotStatus {
                lotId: lot_id,
                status,
            }));
        }
        let current = u32_of(lot.current_version.get());
        if version != current {
            return Err(Error::VersionMismatch(VersionMismatch {
                current,
                got: version,
            }));
        }

        let version_key = U32::from(version);
        let attestations = self.attestations.get(lot_id);
        let attestation = attestations.get(version_key);
        if !attestation.exists.get() {
            return Err(Error::AttestationNotFound(AttestationNotFound {
                lotId: lot_id,
                version,
            }));
        }
        let result = u8_of(attestation.result.get());
        if result != audit_result::PASS && result != audit_result::WARNING {
            return Err(Error::AttestationNotAcceptable(AttestationNotAcceptable {
                result,
            }));
        }

        let total = producer_usdc_units + association_usdc_units;
        if total.is_zero() {
            return Err(Error::InvalidAmount(InvalidAmount {}));
        }

        let order_id = lot.order_id.get();
        let remaining = self.orders.get(order_id).remaining_usdc.get();
        if remaining < total {
            return Err(Error::InsufficientOrderBalance(InsufficientOrderBalance {
                remaining,
                needed: total,
            }));
        }

        let mut lot = self.lots.setter(lot_id);
        lot.accepted_version.set(version_key);
        lot.accepted_quote_hash.set(quote_hash);
        lot.accepted_net_pen_minor.set(net_pen_minor);
        lot.producer_usdc.set(producer_usdc_units);
        lot.association_usdc.set(association_usdc_units);
        lot.status.set(U8::from(lot_status::PRODUCER_ACCEPTED));

        log(
            self.vm(),
            SettlementAccepted {
                lotId: lot_id,
                version,
                quoteHash: quote_hash,
                producerUsdcUnits: producer_usdc_units,
                associationUsdcUnits: association_usdc_units,
            },
        );
        Ok(())
    }

    pub fn settle_lot(&mut self, lot_id: U256) -> Result<(), Error> {
        let lot = self.lots.get(lot_id);
        if !lot.exists.get() {
            return Err(Error::LotNotFound(LotNotFound { lotId: lot_id }));
        }
        let status = u8_of(lot.status.get());
        if status == lot_status::SETTLED {
            return Err(Error::AlreadySettled(AlreadySettled { lotId: lot_id }));
        }
        if status != lot_status::PRODUCER_ACCEPTED {
            return Err(Error::InvalidLotStatus(InvalidLotStatus {
                lotId: lot_id,
                status,
            }));
        }

        let sender = self.vm().msg_sender();
        let producer = lot.producer.get();
        if self.access.has_role(AUDITOR_AGENT_ROLE, sender)
            && !self.access.has_role(PLATFORM_ADMIN_ROLE, sender)
            && sender != producer
        {
            return Err(Error::Unauthorized(Unauthorized {
                account: sender,
                neededRole: PLATFORM_ADMIN_ROLE,
            }));
        }

        let order_id = lot.order_id.get();
        let producer_usdc = lot.producer_usdc.get();
        let association_usdc = lot.association_usdc.get();
        let total = producer_usdc + association_usdc;
        let association = self.orders.get(order_id).association.get();
        let remaining = self.orders.get(order_id).remaining_usdc.get();

        if remaining < total {
            return Err(Error::InsufficientOrderBalance(InsufficientOrderBalance {
                remaining,
                needed: total,
            }));
        }

        if !producer_usdc.is_zero() {
            self.push_usdc(producer, producer_usdc)?;
        }
        if !association_usdc.is_zero() {
            self.push_usdc(association, association_usdc)?;
        }

        let new_remaining = remaining - total;
        {
            let mut order = self.orders.setter(order_id);
            order.remaining_usdc.set(new_remaining);
            if new_remaining.is_zero() {
                order.status.set(U8::from(order_status::COMPLETED));
            } else {
                order.status.set(U8::from(order_status::PARTIALLY_SETTLED));
            }
        }

        self.lots
            .setter(lot_id)
            .status
            .set(U8::from(lot_status::SETTLED));

        log(
            self.vm(),
            LotSettled {
                lotId: lot_id,
                producerUsdcUnits: producer_usdc,
                associationUsdcUnits: association_usdc,
            },
        );

        if new_remaining.is_zero() {
            log(self.vm(), OrderCompleted { orderId: order_id });
        }
        Ok(())
    }

    pub fn get_order(
        &self,
        order_id: U256,
    ) -> (Address, Address, B256, U256, U256, U256, u8, bool) {
        let order = self.orders.get(order_id);
        (
            order.buyer.get(),
            order.association.get(),
            order.pricing_policy_hash.get(),
            order.budget_usdc.get(),
            order.funded_usdc.get(),
            order.remaining_usdc.get(),
            u8_of(order.status.get()),
            order.exists.get(),
        )
    }

    pub fn get_lot(
        &self,
        lot_id: U256,
    ) -> (U256, Address, u8, u32, u32, B256, U256, U256, U256, bool) {
        let lot = self.lots.get(lot_id);
        (
            lot.order_id.get(),
            lot.producer.get(),
            u8_of(lot.status.get()),
            u32_of(lot.current_version.get()),
            u32_of(lot.accepted_version.get()),
            lot.accepted_quote_hash.get(),
            lot.accepted_net_pen_minor.get(),
            lot.producer_usdc.get(),
            lot.association_usdc.get(),
            lot.exists.get(),
        )
    }

    pub fn get_audit_attestation(&self, lot_id: U256, version: u32) -> (B256, u8, bool) {
        let attestations = self.attestations.get(lot_id);
        let attestation = attestations.get(U32::from(version));
        (
            attestation.report_hash.get(),
            u8_of(attestation.result.get()),
            attestation.exists.get(),
        )
    }

    pub fn get_inspection(&self, lot_id: U256, version: u32) -> (u64, u32, B256, bool) {
        let inspections = self.inspections.get(lot_id);
        let inspection = inspections.get(U32::from(version));
        (
            u64_of(inspection.weight_grams.get()),
            u32_of(inspection.category_code.get()),
            inspection.evidence_hash.get(),
            inspection.exists.get(),
        )
    }
}

#[public]
impl IAccessControl for AlpactoCore {
    type Error = Error;

    fn has_role(&self, role: B256, account: Address) -> bool {
        self.access.has_role(role, account)
    }

    fn only_role(&self, role: B256) -> Result<(), Self::Error> {
        self.require_role(role)
    }

    fn get_role_admin(&self, role: B256) -> B256 {
        self.access.get_role_admin(role)
    }

    fn grant_role(&mut self, role: B256, account: Address) -> Result<(), Self::Error> {
        let admin_role = self.access.get_role_admin(role);
        self.require_role(admin_role)?;
        self.access._grant_role(role, account);
        Ok(())
    }

    fn revoke_role(&mut self, role: B256, account: Address) -> Result<(), Self::Error> {
        let admin_role = self.access.get_role_admin(role);
        self.require_role(admin_role)?;
        self.access._revoke_role(role, account);
        Ok(())
    }

    fn renounce_role(&mut self, role: B256, confirmation: Address) -> Result<(), Self::Error> {
        let sender = self.vm().msg_sender();
        if sender != confirmation {
            return Err(Error::AccessControlBadConfirmation(AccessControlBadConfirm {}));
        }
        self.access._revoke_role(role, confirmation);
        Ok(())
    }
}

impl AlpactoCore {
    fn require_role(&self, role: B256) -> Result<(), Error> {
        Ok(self
            .access
            ._check_role(role, self.vm().msg_sender())?)
    }

    fn pull_usdc(&mut self, from: Address, amount: U256) -> Result<(), Error> {
        let token = self.usdc.get();
        if token.is_zero() {
            return Ok(());
        }
        let to = self.vm().contract_address();
        let erc20 = Erc20Interface::new(token);
        let ok = erc20
            .transfer_from(self, from, to, amount)
            .map_err(|_: CallError| Error::TokenTransferFailed(TokenTransferFailed {}))?;
        if !ok {
            return Err(Error::TokenTransferFailed(TokenTransferFailed {}));
        }
        Ok(())
    }

    fn push_usdc(&mut self, to: Address, amount: U256) -> Result<(), Error> {
        let token = self.usdc.get();
        if token.is_zero() {
            return Ok(());
        }
        let erc20 = Erc20Interface::new(token);
        let ok = erc20
            .transfer(self, to, amount)
            .map_err(|_: CallError| Error::TokenTransferFailed(TokenTransferFailed {}))?;
        if !ok {
            return Err(Error::TokenTransferFailed(TokenTransferFailed {}));
        }
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use stylus_sdk::testing::*;

    // OZ AccessControl / IERC20 still touch hostio; stub for native tests.
    #[no_mangle]
    pub unsafe extern "C" fn emit_log(_pointer: *const u8, _len: usize, _: usize) {}
    #[no_mangle]
    pub unsafe extern "C" fn msg_sender(sender: *mut u8) {
        let bytes = [0u8; 20];
        core::ptr::copy_nonoverlapping(bytes.as_ptr(), sender, 20);
    }
    #[no_mangle]
    pub unsafe extern "C" fn call_contract(
        _contract: *const u8,
        _calldata: *const u8,
        _calldata_len: usize,
        _value: *const u8,
        _gas: u64,
        _return_data_len: *mut usize,
    ) -> u8 {
        1
    }
    #[no_mangle]
    pub unsafe extern "C" fn delegate_call_contract(
        _contract: *const u8,
        _calldata: *const u8,
        _calldata_len: usize,
        _gas: u64,
        _return_data_len: *mut usize,
    ) -> u8 {
        1
    }
    #[no_mangle]
    pub unsafe extern "C" fn static_call_contract(
        _contract: *const u8,
        _calldata: *const u8,
        _calldata_len: usize,
        _gas: u64,
        _return_data_len: *mut usize,
    ) -> u8 {
        1
    }
    #[no_mangle]
    pub unsafe extern "C" fn storage_flush_cache(_clear: bool) {}
    #[no_mangle]
    pub unsafe extern "C" fn return_data_size() -> usize {
        0
    }
    #[no_mangle]
    pub unsafe extern "C" fn read_return_data(_dest: *mut u8, _offset: usize, _size: usize) -> usize {
        0
    }

    fn setup() -> (TestVM, AlpactoCore, Address, Address, Address, Address, Address, Address) {
        let vm = TestVM::default();
        let mut core = AlpactoCore::from(&vm);
        let admin = Address::from([0xA1; 20]);
        let buyer = Address::from([0xB1; 20]);
        let association = Address::from([0xC1; 20]);
        let inspector = Address::from([0xD1; 20]);
        let auditor = Address::from([0xE1; 20]);
        let producer = Address::from([0xF1; 20]);

        vm.set_sender(admin);
        core.constructor(admin, Address::ZERO).unwrap();
        core.grant_role(PLATFORM_ADMIN_ROLE, admin).unwrap();
        core.grant_role(BUYER_ROLE, buyer).unwrap();
        core.grant_role(ASSOCIATION_ROLE, association).unwrap();
        core.grant_role(INSPECTOR_ROLE, inspector).unwrap();
        core.grant_role(AUDITOR_AGENT_ROLE, auditor).unwrap();

        (vm, core, admin, buyer, association, inspector, auditor, producer)
    }

    fn policy_hash() -> B256 {
        B256::from([0x11; 32])
    }

    fn payment_ref(n: u8) -> B256 {
        B256::from([n; 32])
    }

    #[test]
    fn test_unauthorized_create_order() {
        let (vm, mut core, _admin, buyer, association, _inspector, _auditor, _producer) = setup();
        vm.set_sender(association); // not buyer
        let err = core
            .create_order(
                U256::from(1),
                buyer,
                association,
                policy_hash(),
                U256::from(1_000_000),
            )
            .unwrap_err();
        assert!(matches!(
            err,
            crate::Error::AccessControlUnauthorized(_) | crate::Error::Unauthorized(_)
        ));
    }

    #[test]
    fn test_happy_path_settle() {
        let (vm, mut core, admin, buyer, association, inspector, auditor, producer) = setup();

        vm.set_sender(buyer);
        core.create_order(
            U256::from(1),
            buyer,
            association,
            policy_hash(),
            U256::from(1_000_000),
        )
        .unwrap();

        vm.set_sender(admin);
        core.fund_order(U256::from(1), U256::from(500_000), payment_ref(1))
            .unwrap();
        // double funding ok
        core.fund_order(U256::from(1), U256::from(500_000), payment_ref(2))
            .unwrap();

        let order = core.get_order(U256::from(1));
        assert_eq!(order.5, U256::from(1_000_000)); // remaining
        assert_eq!(order.6, order_status::ACCEPTING_LOTS);

        vm.set_sender(association);
        core.register_lot(U256::from(1), U256::from(10), producer)
            .unwrap();

        vm.set_sender(inspector);
        core.submit_inspection_reference(
            U256::from(10),
            1,
            42_500,
            1,
            B256::from([0x22; 32]),
        )
        .unwrap();

        vm.set_sender(auditor);
        core.submit_audit_attestation(
            U256::from(10),
            1,
            B256::from([0x33; 32]),
            audit_result::PASS,
        )
        .unwrap();

        vm.set_sender(producer);
        core.accept_settlement(
            U256::from(10),
            1,
            B256::from([0x44; 32]),
            U256::from(1000),
            U256::from(800_000),
            U256::from(200_000),
        )
        .unwrap();

        core.settle_lot(U256::from(10)).unwrap();
        let lot = core.get_lot(U256::from(10));
        assert_eq!(lot.2, lot_status::SETTLED);
        let order = core.get_order(U256::from(1));
        assert_eq!(order.5, U256::ZERO);
        assert_eq!(order.6, order_status::COMPLETED);
    }

    #[test]
    fn test_payment_ref_reuse_fails() {
        let (vm, mut core, admin, buyer, association, _inspector, _auditor, _producer) = setup();
        vm.set_sender(buyer);
        core.create_order(
            U256::from(1),
            buyer,
            association,
            policy_hash(),
            U256::from(1_000_000),
        )
        .unwrap();
        vm.set_sender(admin);
        core.fund_order(U256::from(1), U256::from(100), payment_ref(9))
            .unwrap();
        let err = core
            .fund_order(U256::from(1), U256::from(100), payment_ref(9))
            .unwrap_err();
        assert!(matches!(err, crate::Error::PaymentRefUsed(_)));
    }

    #[test]
    fn test_inspection_version_append_only() {
        let (vm, mut core, admin, buyer, association, inspector, _auditor, producer) = setup();
        vm.set_sender(buyer);
        core.create_order(
            U256::from(1),
            buyer,
            association,
            policy_hash(),
            U256::from(1_000_000),
        )
        .unwrap();
        vm.set_sender(admin);
        core.fund_order(U256::from(1), U256::from(1_000_000), payment_ref(1))
            .unwrap();
        vm.set_sender(association);
        core.register_lot(U256::from(1), U256::from(10), producer)
            .unwrap();
        vm.set_sender(inspector);
        core.submit_inspection_reference(U256::from(10), 1, 100, 1, B256::from([1; 32]))
            .unwrap();
        let err = core
            .submit_inspection_reference(U256::from(10), 1, 100, 1, B256::from([1; 32]))
            .unwrap_err();
        assert!(matches!(
            err,
            crate::Error::InvalidInspectionVersion(_) | crate::Error::InvalidLotStatus(_)
        ));
    }

    #[test]
    fn test_unauthorized_attestation() {
        let (vm, mut core, admin, buyer, association, inspector, _auditor, producer) = setup();
        vm.set_sender(buyer);
        core.create_order(
            U256::from(1),
            buyer,
            association,
            policy_hash(),
            U256::from(1_000_000),
        )
        .unwrap();
        vm.set_sender(admin);
        core.fund_order(U256::from(1), U256::from(1_000_000), payment_ref(1))
            .unwrap();
        vm.set_sender(association);
        core.register_lot(U256::from(1), U256::from(10), producer)
            .unwrap();
        vm.set_sender(inspector);
        core.submit_inspection_reference(U256::from(10), 1, 100, 1, B256::from([1; 32]))
            .unwrap();
        // inspector cannot attest
        let err = core
            .submit_audit_attestation(U256::from(10), 1, B256::from([2; 32]), audit_result::PASS)
            .unwrap_err();
        assert!(matches!(err, crate::Error::AccessControlUnauthorized(_)));
    }

    #[test]
    fn test_ayni_cannot_settle() {
        let (vm, mut core, admin, buyer, association, inspector, auditor, producer) = setup();
        vm.set_sender(buyer);
        core.create_order(
            U256::from(1),
            buyer,
            association,
            policy_hash(),
            U256::from(1_000_000),
        )
        .unwrap();
        vm.set_sender(admin);
        core.fund_order(U256::from(1), U256::from(1_000_000), payment_ref(1))
            .unwrap();
        vm.set_sender(association);
        core.register_lot(U256::from(1), U256::from(10), producer)
            .unwrap();
        vm.set_sender(inspector);
        core.submit_inspection_reference(U256::from(10), 1, 100, 1, B256::from([1; 32]))
            .unwrap();
        vm.set_sender(auditor);
        core.submit_audit_attestation(U256::from(10), 1, B256::from([2; 32]), audit_result::PASS)
            .unwrap();
        vm.set_sender(producer);
        core.accept_settlement(
            U256::from(10),
            1,
            B256::from([3; 32]),
            U256::from(1),
            U256::from(700_000),
            U256::from(300_000),
        )
        .unwrap();
        vm.set_sender(auditor);
        let err = core.settle_lot(U256::from(10)).unwrap_err();
        assert!(matches!(err, crate::Error::Unauthorized(_)));
    }

    #[test]
    fn test_accept_old_version_fails() {
        let (vm, mut core, admin, buyer, association, inspector, auditor, producer) = setup();
        vm.set_sender(buyer);
        core.create_order(
            U256::from(1),
            buyer,
            association,
            policy_hash(),
            U256::from(1_000_000),
        )
        .unwrap();
        vm.set_sender(admin);
        core.fund_order(U256::from(1), U256::from(1_000_000), payment_ref(1))
            .unwrap();
        vm.set_sender(association);
        core.register_lot(U256::from(1), U256::from(10), producer)
            .unwrap();
        vm.set_sender(inspector);
        core.submit_inspection_reference(U256::from(10), 1, 100, 1, B256::from([1; 32]))
            .unwrap();
        vm.set_sender(auditor);
        core.submit_audit_attestation(
            U256::from(10),
            1,
            B256::from([2; 32]),
            audit_result::REVIEW_REQUIRED,
        )
        .unwrap();
        vm.set_sender(producer);
        core.request_reweighing(U256::from(10), B256::from([9; 32]))
            .unwrap();
        vm.set_sender(inspector);
        core.submit_inspection_reference(U256::from(10), 2, 105, 1, B256::from([4; 32]))
            .unwrap();
        vm.set_sender(auditor);
        core.submit_audit_attestation(U256::from(10), 2, B256::from([5; 32]), audit_result::PASS)
            .unwrap();
        vm.set_sender(producer);
        let err = core
            .accept_settlement(
                U256::from(10),
                1, // old version
                B256::from([6; 32]),
                U256::from(1),
                U256::from(500_000),
                U256::from(500_000),
            )
            .unwrap_err();
        assert!(matches!(err, crate::Error::VersionMismatch(_)));
    }

    #[test]
    fn test_insufficient_balance_and_duplicate_settle() {
        let (vm, mut core, admin, buyer, association, inspector, auditor, producer) = setup();
        vm.set_sender(buyer);
        core.create_order(
            U256::from(1),
            buyer,
            association,
            policy_hash(),
            U256::from(100_000),
        )
        .unwrap();
        vm.set_sender(admin);
        core.fund_order(U256::from(1), U256::from(100_000), payment_ref(1))
            .unwrap();
        vm.set_sender(association);
        core.register_lot(U256::from(1), U256::from(10), producer)
            .unwrap();
        vm.set_sender(inspector);
        core.submit_inspection_reference(U256::from(10), 1, 100, 1, B256::from([1; 32]))
            .unwrap();
        vm.set_sender(auditor);
        core.submit_audit_attestation(U256::from(10), 1, B256::from([2; 32]), audit_result::PASS)
            .unwrap();
        vm.set_sender(producer);
        let err = core
            .accept_settlement(
                U256::from(10),
                1,
                B256::from([3; 32]),
                U256::from(1),
                U256::from(80_000),
                U256::from(30_000), // total 110k > 100k
            )
            .unwrap_err();
        assert!(matches!(err, crate::Error::InsufficientOrderBalance(_)));

        core.accept_settlement(
            U256::from(10),
            1,
            B256::from([3; 32]),
            U256::from(1),
            U256::from(70_000),
            U256::from(30_000),
        )
        .unwrap();
        core.settle_lot(U256::from(10)).unwrap();
        let err = core.settle_lot(U256::from(10)).unwrap_err();
        assert!(matches!(err, crate::Error::AlreadySettled(_)));
    }

    #[test]
    fn test_reweigh_then_settle() {
        let (vm, mut core, admin, buyer, association, inspector, auditor, producer) = setup();
        vm.set_sender(buyer);
        core.create_order(
            U256::from(1),
            buyer,
            association,
            policy_hash(),
            U256::from(1_000_000),
        )
        .unwrap();
        vm.set_sender(admin);
        core.fund_order(U256::from(1), U256::from(1_000_000), payment_ref(1))
            .unwrap();
        vm.set_sender(association);
        core.register_lot(U256::from(1), U256::from(10), producer)
            .unwrap();
        vm.set_sender(inspector);
        core.submit_inspection_reference(U256::from(10), 1, 42_500, 1, B256::from([1; 32]))
            .unwrap();
        vm.set_sender(auditor);
        core.submit_audit_attestation(
            U256::from(10),
            1,
            B256::from([2; 32]),
            audit_result::REVIEW_REQUIRED,
        )
        .unwrap();
        vm.set_sender(producer);
        core.request_reweighing(U256::from(10), B256::from([9; 32]))
            .unwrap();
        vm.set_sender(inspector);
        core.submit_inspection_reference(U256::from(10), 2, 41_500, 1, B256::from([4; 32]))
            .unwrap();
        vm.set_sender(auditor);
        core.submit_audit_attestation(U256::from(10), 2, B256::from([5; 32]), audit_result::PASS)
            .unwrap();
        vm.set_sender(producer);
        core.accept_settlement(
            U256::from(10),
            2,
            B256::from([6; 32]),
            U256::from(1),
            U256::from(900_000),
            U256::from(100_000),
        )
        .unwrap();
        core.settle_lot(U256::from(10)).unwrap();
        assert_eq!(core.get_lot(U256::from(10)).2, lot_status::SETTLED);
        assert_eq!(core.get_lot(U256::from(10)).3, 2); // current version
    }
}
