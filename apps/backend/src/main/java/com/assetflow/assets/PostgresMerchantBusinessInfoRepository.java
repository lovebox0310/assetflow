package com.assetflow.assets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Date;
import java.time.Instant;
import java.util.Optional;

@Component
@Profile("postgres")
public class PostgresMerchantBusinessInfoRepository implements MerchantBusinessInfoRepository {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresMerchantBusinessInfoRepository(JdbcTemplate jdbc,
                                                  @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    @Override
    public Optional<MerchantBusinessInfo> findByBusinessNo(String businessNo) {
        return jdbc.query("""
                        SELECT id, user_id, business_no, company_name, ceo_name, biz_type, biz_item,
                               main_product, phone, fax, company_size, corporate_type, tax_type,
                               headquarters, corporate_form, registered_at, homepage, ir_homepage,
                               email, business_status, corporate_reg_no, employees, zip_code,
                               address, tax_office, fiscal_month, source, fetched_at
                        FROM merchant_business_info
                        WHERE user_id = ? AND business_no = ?
                        """,
                (rs, n) -> new MerchantBusinessInfo(
                        rs.getLong("id"),
                        rs.getLong("user_id"),
                        rs.getString("business_no"),
                        rs.getString("company_name"),
                        rs.getString("ceo_name"),
                        rs.getString("biz_type"),
                        rs.getString("biz_item"),
                        rs.getString("main_product"),
                        rs.getString("phone"),
                        rs.getString("fax"),
                        rs.getString("company_size"),
                        rs.getString("corporate_type"),
                        rs.getString("tax_type"),
                        rs.getString("headquarters"),
                        rs.getString("corporate_form"),
                        rs.getDate("registered_at") == null ? null : rs.getDate("registered_at").toLocalDate(),
                        rs.getString("homepage"),
                        rs.getString("ir_homepage"),
                        rs.getString("email"),
                        rs.getString("business_status"),
                        rs.getString("corporate_reg_no"),
                        rs.getObject("employees", Integer.class),
                        rs.getString("zip_code"),
                        rs.getString("address"),
                        rs.getString("tax_office"),
                        rs.getObject("fiscal_month", Integer.class),
                        rs.getString("source"),
                        rs.getTimestamp("fetched_at").toInstant()),
                userId, businessNo).stream().findFirst();
    }

    @Override
    public void save(MerchantBusinessInfo info) {
        jdbc.update("""
                        INSERT INTO merchant_business_info (
                            user_id, business_no, company_name, ceo_name, biz_type, biz_item,
                            main_product, phone, fax, company_size, corporate_type, tax_type,
                            headquarters, corporate_form, registered_at, homepage, ir_homepage,
                            email, business_status, corporate_reg_no, employees, zip_code,
                            address, tax_office, fiscal_month, source, fetched_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
                        ON CONFLICT (user_id, business_no) DO UPDATE SET
                            company_name = EXCLUDED.company_name,
                            ceo_name = EXCLUDED.ceo_name,
                            biz_type = EXCLUDED.biz_type,
                            biz_item = EXCLUDED.biz_item,
                            main_product = EXCLUDED.main_product,
                            phone = EXCLUDED.phone,
                            fax = EXCLUDED.fax,
                            company_size = EXCLUDED.company_size,
                            corporate_type = EXCLUDED.corporate_type,
                            tax_type = EXCLUDED.tax_type,
                            headquarters = EXCLUDED.headquarters,
                            corporate_form = EXCLUDED.corporate_form,
                            registered_at = EXCLUDED.registered_at,
                            homepage = EXCLUDED.homepage,
                            ir_homepage = EXCLUDED.ir_homepage,
                            email = EXCLUDED.email,
                            business_status = EXCLUDED.business_status,
                            corporate_reg_no = EXCLUDED.corporate_reg_no,
                            employees = EXCLUDED.employees,
                            zip_code = EXCLUDED.zip_code,
                            address = EXCLUDED.address,
                            tax_office = EXCLUDED.tax_office,
                            fiscal_month = EXCLUDED.fiscal_month,
                            source = EXCLUDED.source,
                            fetched_at = EXCLUDED.fetched_at,
                            updated_at = now()
                        """,
                userId, info.businessNo(), info.companyName(), info.ceoName(), info.bizType(), info.bizItem(),
                info.mainProduct(), info.phone(), info.fax(), info.companySize(), info.corporateType(), info.taxType(),
                info.headquarters(), info.corporateForm(),
                info.registeredAt() == null ? null : Date.valueOf(info.registeredAt()),
                info.homepage(), info.irHomepage(), info.email(), info.businessStatus(), info.corporateRegNo(),
                info.employees(), info.zipCode(), info.address(), info.taxOffice(), info.fiscalMonth(),
                info.source(),
                info.fetchedAt() == null ? java.sql.Timestamp.from(Instant.now())
                        : java.sql.Timestamp.from(info.fetchedAt()));
    }
}
