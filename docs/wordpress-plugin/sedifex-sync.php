<?php
/**
 * Plugin Name: Sedifex Sync (MVP)
 * Description: Store settings, shortcode renderer, and sync health for Sedifex product catalog.
 * Version: 0.1.0
 */

if (!defined('ABSPATH')) {
  exit;
}

const SEDIFEX_SYNC_OPTION = 'sedifex_sync_settings';
const SEDIFEX_SYNC_HEALTH_OPTION = 'sedifex_sync_health';

function sedifex_sync_register_settings() {
  register_setting('sedifex_sync', SEDIFEX_SYNC_OPTION);

  add_options_page(
    'Sedifex Sync',
    'Sedifex Sync',
    'manage_options',
    'sedifex-sync',
    'sedifex_sync_render_settings_page'
  );
}
add_action('admin_menu', 'sedifex_sync_register_settings');

function sedifex_sync_render_settings_page() {
  $settings = get_option(SEDIFEX_SYNC_OPTION, [
    'api_base_url' => '',
    'store_id' => '',
    'integration_key' => '',
    'cache_ttl' => 60,
  ]);
  ?>
  <div class="wrap">
    <h1>Sedifex Sync</h1>
    <form method="post" action="options.php">
      <?php settings_fields('sedifex_sync'); ?>
      <table class="form-table" role="presentation">
        <tr>
          <th scope="row"><label for="api_base_url">API base URL</label></th>
          <td><input name="<?php echo esc_attr(SEDIFEX_SYNC_OPTION); ?>[api_base_url]" id="api_base_url" value="<?php echo esc_attr($settings['api_base_url']); ?>" class="regular-text" /></td>
        </tr>
        <tr>
          <th scope="row"><label for="store_id">Store ID</label></th>
          <td><input name="<?php echo esc_attr(SEDIFEX_SYNC_OPTION); ?>[store_id]" id="store_id" value="<?php echo esc_attr($settings['store_id']); ?>" class="regular-text" /></td>
        </tr>
        <tr>
          <th scope="row"><label for="integration_key">Integration API key</label></th>
          <td><input name="<?php echo esc_attr(SEDIFEX_SYNC_OPTION); ?>[integration_key]" id="integration_key" value="<?php echo esc_attr($settings['integration_key']); ?>" class="regular-text" /></td>
        </tr>
        <tr>
          <th scope="row"><label for="cache_ttl">Cache TTL (seconds)</label></th>
          <td><input type="number" min="30" max="300" name="<?php echo esc_attr(SEDIFEX_SYNC_OPTION); ?>[cache_ttl]" id="cache_ttl" value="<?php echo esc_attr($settings['cache_ttl']); ?>" /></td>
        </tr>
      </table>
      <?php submit_button('Save settings'); ?>
    </form>
    <?php sedifex_sync_render_health(); ?>
  </div>
  <?php
}

function sedifex_sync_render_health() {
  $health = get_option(SEDIFEX_SYNC_HEALTH_OPTION, [
    'last_success_at' => null,
    'last_failure_at' => null,
    'last_error' => null,
    'item_count' => 0,
  ]);

  echo '<h2>Sync health</h2>';
  echo '<p><strong>Last success:</strong> ' . esc_html($health['last_success_at'] ?: 'Never') . '</p>';
  echo '<p><strong>Last failure:</strong> ' . esc_html($health['last_failure_at'] ?: 'Never') . '</p>';
  echo '<p><strong>Items synced:</strong> ' . esc_html((string) $health['item_count']) . '</p>';

  if (!empty($health['last_error'])) {
    echo '<p><strong>Last error:</strong> ' . esc_html($health['last_error']) . '</p>';
  }
}

function sedifex_sync_fetch_products($force = false) {
  $settings = get_option(SEDIFEX_SYNC_OPTION, []);
  $cache_key = 'sedifex_sync_products';
  $cache_ttl = max(30, min(300, intval($settings['cache_ttl'] ?? 60)));

  if (!$force) {
    $cached = get_transient($cache_key);
    if ($cached !== false) {
      return $cached;
    }
  }

  $url = trailingslashit($settings['api_base_url'] ?? '') . 'integrationProducts?storeId=' . urlencode($settings['store_id'] ?? '');
  $response = wp_remote_get($url, [
    'timeout' => 15,
    'headers' => [
      'Authorization' => 'Bearer ' . ($settings['integration_key'] ?? ''),
      'Accept' => 'application/json',
    ],
  ]);

  if (is_wp_error($response)) {
    update_option(SEDIFEX_SYNC_HEALTH_OPTION, [
      'last_success_at' => get_option(SEDIFEX_SYNC_HEALTH_OPTION)['last_success_at'] ?? null,
      'last_failure_at' => gmdate(DATE_ATOM),
      'last_error' => $response->get_error_message(),
      'item_count' => 0,
    ]);
    return [];
  }

  $status = wp_remote_retrieve_response_code($response);
  $body = wp_remote_retrieve_body($response);
  $payload = json_decode($body, true);

  if ($status < 200 || $status >= 300 || !is_array($payload)) {
    update_option(SEDIFEX_SYNC_HEALTH_OPTION, [
      'last_success_at' => get_option(SEDIFEX_SYNC_HEALTH_OPTION)['last_success_at'] ?? null,
      'last_failure_at' => gmdate(DATE_ATOM),
      'last_error' => 'Non-success response: ' . $status,
      'item_count' => 0,
    ]);
    return [];
  }

  $products = is_array($payload['products'] ?? null) ? $payload['products'] : [];
  set_transient($cache_key, $products, $cache_ttl);

  update_option(SEDIFEX_SYNC_HEALTH_OPTION, [
    'last_success_at' => gmdate(DATE_ATOM),
    'last_failure_at' => null,
    'last_error' => null,
    'item_count' => count($products),
  ]);

  return $products;
}

function sedifex_sync_shortcode() {
  $products = sedifex_sync_fetch_products();
  if (!$products) {
    return '<p>No products available right now.</p>';
  }

  ob_start();
  echo '<div class="sedifex-products">';
  foreach ($products as $product) {
    $name = esc_html($product['name'] ?? 'Untitled product');
    $price = esc_html((string) ($product['price'] ?? '0'));
    echo '<article class="sedifex-product">';
    echo '<h3>' . $name . '</h3>';
    echo '<p>Price: ' . $price . '</p>';
    echo '</article>';
  }
  echo '</div>';

  return (string) ob_get_clean();
}
add_shortcode('sedifex_products', 'sedifex_sync_shortcode');

function sedifex_sync_register_block() {
  if (!function_exists('register_block_type')) {
    return;
  }

  register_block_type('sedifex/products', [
    'render_callback' => 'sedifex_sync_shortcode',
  ]);
}
add_action('init', 'sedifex_sync_register_block');
