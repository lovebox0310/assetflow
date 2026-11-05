package com.assetflow.assets.card.email;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

@Component
@Profile("postgres")
public class PostgresCardEmailImportSettingsLedger implements CardEmailImportSettingsLedger {

    private final JdbcTemplate jdbc;

    public PostgresCardEmailImportSettingsLedger(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private CardEmailImportSettings map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        Timestamp lastImportAt = rs.getTimestamp("last_import_at");
        return new CardEmailImportSettings(
                rs.getLong("id"),
                rs.getLong("user_id"),
                rs.getBoolean("enabled"),
                rs.getString("card_company"),
                rs.getString("email_provider"),
                rs.getString("email_address"),
                rs.getString("email_password_enc"),
                rs.getString("vestmail_password_enc"),
                lastImportAt == null ? null : lastImportAt.toInstant(),
                rs.getString("last_import_status"));
    }

    @Override
    public Optional<CardEmailImportSettings> findByUserIdAndCardCompany(Long userId, String cardCompany) {
        var rows = jdbc.query("""
                SELECT id, user_id, enabled, card_company, email_provider, email_address,
                       email_password_enc, vestmail_password_enc, last_import_at, last_import_status
                  FROM card_email_import_settings
                 WHERE user_id = ? AND card_company = ?
                """, this::map, userId, cardCompany);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    @Override
    public List<CardEmailImportSettings> findByUserId(Long userId) {
        return jdbc.query("""
                SELECT id, user_id, enabled, card_company, email_provider, email_address,
                       email_password_enc, vestmail_password_enc, last_import_at, last_import_status
                  FROM card_email_import_settings
                 WHERE user_id = ?
                """, this::map, userId);
    }

    @Override
    public List<CardEmailImportSettings> findEnabled() {
        return jdbc.query("""
                SELECT id, user_id, enabled, card_company, email_provider, email_address,
                       email_password_enc, vestmail_password_enc, last_import_at, last_import_status
                  FROM card_email_import_settings
                 WHERE enabled = true
                """, this::map);
    }

    @Override
    @Transactional
    public CardEmailImportSettings save(CardEmailImportSettings settings) {
        Optional<CardEmailImportSettings> existing =
                findByUserIdAndCardCompany(settings.userId(), settings.cardCompany());
        if (existing.isPresent()) {
            jdbc.update("""
                    UPDATE card_email_import_settings
                       SET enabled = ?,
                           email_provider = ?,
                           email_address = ?,
                           email_password_enc = ?,
                           vestmail_password_enc = ?,
                           updated_at = now()
                     WHERE id = ?
                    """,
                    settings.enabled(),
                    settings.emailProvider(),
                    settings.emailAddress(),
                    settings.emailPasswordEnc(),
                    settings.vestmailPasswordEnc(),
                    existing.get().id());
            return findByUserIdAndCardCompany(settings.userId(), settings.cardCompany()).orElseThrow();
        }

        Long id = jdbc.queryForObject("""
                INSERT INTO card_email_import_settings
                    (user_id, enabled, card_company, email_provider, email_address,
                     email_password_enc, vestmail_password_enc)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class,
                settings.userId(),
                settings.enabled(),
                settings.cardCompany(),
                settings.emailProvider(),
                settings.emailAddress(),
                settings.emailPasswordEnc(),
                settings.vestmailPasswordEnc());
        return findByUserIdAndCardCompany(settings.userId(), settings.cardCompany())
                .map(s -> s.withId(id))
                .orElseThrow();
    }

    @Override
    @Transactional
    public void delete(Long userId, String cardCompany) {
        jdbc.update("""
                DELETE FROM card_email_import_settings
                 WHERE user_id = ? AND card_company = ?
                """, userId, cardCompany);
    }
}
