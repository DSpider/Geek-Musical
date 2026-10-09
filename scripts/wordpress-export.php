<?php
// Runs under WP-CLI only. Credentials, user hashes and private options remain in backup.
$result = ['posts'=>[], 'pages'=>[], 'inventory'=>[], 'metas'=>[], 'templates'=>[], 'offers'=>[], 'attachments'=>[], 'authors'=>[], 'categories'=>[], 'tags'=>[], 'relations'=>[], 'tagRelations'=>[], 'stories'=>[], 'pretty'=>[], 'rankMath'=>[], 'publicOptions'=>[]];
$all = get_posts(['post_type'=>['post','page','elementor_library','web-story'], 'post_status'=>['publish','draft','pending','private','future'], 'numberposts'=>-1]);
foreach ($all as $post) {
  $result['inventory'][] = ['id'=>$post->ID,'type'=>$post->post_type,'status'=>$post->post_status,'slug'=>$post->post_name,'title'=>$post->post_title,'url'=>get_permalink($post)];
  $meta = [];
  foreach (['_thumbnail_id','_elementor_data','rank_math_description','rank_math_title','_yoast_wpseo_title','_yoast_wpseo_metadesc'] as $key) {
    $v = get_post_meta($post->ID,$key,true); if ($v !== '') $meta[$key]=$v;
  }
  $result['metas'][(string)$post->ID]=$meta;
  if ($post->post_type==='elementor_library') { $result['templates'][(string)$post->ID]=['id'=>$post->ID,'body'=>$post->post_content]; continue; }
  $item=['id'=>$post->ID,'slug'=>$post->post_name,'title'=>$post->post_title,'excerpt'=>$post->post_excerpt,'body'=>$post->post_content,'authorId'=>(int)$post->post_author,'publishedAt'=>$post->post_date,'updatedAt'=>$post->post_modified,'status'=>$post->post_status,'url'=>get_permalink($post), 'tags'=>wp_get_post_terms($post->ID,'post_tag',['fields'=>'ids'])];
  $item['sourceHash']=hash('sha256',json_encode(['post'=>$item,'meta'=>$meta],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
  $result[$post->post_type==='post'?'posts':($post->post_type==='web-story'?'stories':'pages')][]=$item;
  foreach(wp_get_post_categories($post->ID) as $cid) $result['relations'][]=[$post->ID,$cid];
  $offers=[];
  foreach(get_post_meta($post->ID) as $key=>$values) if(strpos($key,'_cegg_data_')===0) {
    $items=maybe_unserialize($values[0]); if(!is_array($items)) continue;
    foreach($items as $offer) if(is_array($offer)) { $safe=[]; foreach(['unique_id','title','url','img','merchant','domain'] as $field) if(isset($offer[$field]) && is_scalar($offer[$field])) $safe[$field]=$offer[$field]; if($safe) $offers[]=$safe; }
  }
  $result['offers'][(string)$post->ID]=$offers;
}
foreach(get_terms(['taxonomy'=>'category','hide_empty'=>false]) as $term) $result['categories'][]=['id'=>$term->term_id,'slug'=>$term->slug,'name'=>$term->name,'description'=>$term->description,'parent'=>$term->parent,'url'=>get_term_link($term)];
foreach(get_terms(['taxonomy'=>'post_tag','hide_empty'=>false]) as $term) $result['tags'][]=['id'=>$term->term_id,'slug'=>$term->slug,'name'=>$term->name,'description'=>$term->description,'url'=>get_term_link($term)];
foreach(get_users(['fields'=>['ID','display_name']]) as $user) $result['authors'][]=['id'=>(int)$user->ID,'name'=>$user->display_name];
foreach(get_posts(['post_type'=>'attachment','post_status'=>'inherit','numberposts'=>-1]) as $a) $result['attachments'][]=['id'=>$a->ID,'file'=>get_post_meta($a->ID,'_wp_attached_file',true),'alt'=>get_post_meta($a->ID,'_wp_attachment_image_alt',true),'metadata'=>wp_get_attachment_metadata($a->ID)];
global $wpdb;
$tables=$wpdb->get_col('SHOW TABLES');
foreach($tables as $table) if(preg_match('/^[a-zA-Z0-9_]+$/',$table) && preg_match('/prli_links$/',$table)) foreach($wpdb->get_results("SELECT slug,url,redirect_type,track_me FROM `$table`",ARRAY_A) as $link) $result['pretty'][]=['path'=>'/'.$link['slug'].'/','target'=>$link['url'],'status'=>(int)$link['redirect_type'],'forwardQuery'=>'1'];
foreach(['home','siteurl','blogname','blogdescription','permalink_structure','show_on_front','page_on_front','page_for_posts','active_plugins','timezone_string'] as $key) $result['publicOptions'][$key]=get_option($key);
echo json_encode($result,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);
